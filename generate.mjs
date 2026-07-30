import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const OUTPUT_DIR = new URL("./dist/", import.meta.url);
const isDemo = process.argv.includes("--demo");
const username = process.env.GITHUB_USERNAME || "octo-gardener";

const LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const themes = {
  light: {
    surface: "#f7fbf4",
    panel: "#edf6e9",
    soil: "#d7c2a3",
    soilEdge: "#b99b73",
    grid: "#dcebd8",
    text: "#17351f",
    muted: "#65756a",
    level: ["#dfeadc", "#52b788", "#40916c", "#2d6a4f", "#1b4332"],
    flower: "#e87ba4",
    flowerCore: "#eda100",
    water: "#2a78d6",
    robot: "#65756a",
    robotLight: "#fcfcfb",
    sun: "#eda100",
  },
  dark: {
    surface: "#0d1712",
    panel: "#13251a",
    soil: "#6c5539",
    soilEdge: "#8b704c",
    grid: "#233b2b",
    text: "#eef7ef",
    muted: "#9aab9e",
    level: ["#203529", "#2d6a4f", "#40916c", "#74c69d", "#d8f3dc"],
    flower: "#d55181",
    flowerCore: "#c98500",
    water: "#3987e5",
    robot: "#9aab9e",
    robotLight: "#1a1a19",
    sun: "#c98500",
  },
};

async function fetchCalendar(login, token) {
  if (!token) {
    throw new Error("GITHUB_TOKEN is required unless --demo is used.");
  }

  const query = `
    query ContributionGarden($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                date
                weekday
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-contribution-garden",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status} ${response.statusText}.`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data?.user) {
    throw new Error(`GitHub user "${login}" was not found.`);
  }

  return body.data.user.contributionsCollection.contributionCalendar;
}

function demoCalendar() {
  const start = new Date("2025-07-27T00:00:00Z");
  const weeks = [];
  let totalContributions = 0;

  for (let week = 0; week < 53; week += 1) {
    const contributionDays = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + week * 7 + weekday);
      const wave = Math.sin(week * 0.47 + weekday * 1.31) + Math.cos(week * 0.19 - weekday);
      const pause = (week + weekday * 3) % 11 === 0 || weekday === 0;
      const contributionCount = pause ? 0 : Math.max(0, Math.round((wave + 1.35) * 2.1));
      totalContributions += contributionCount;
      contributionDays.push({
        date: date.toISOString().slice(0, 10),
        weekday,
        contributionCount,
        contributionLevel: levelFromCount(contributionCount),
      });
    }
    weeks.push({ contributionDays });
  }

  return { totalContributions, weeks };
}

function levelFromCount(count) {
  if (count === 0) return "NONE";
  if (count <= 2) return "FIRST_QUARTILE";
  if (count <= 4) return "SECOND_QUARTILE";
  if (count <= 6) return "THIRD_QUARTILE";
  return "FOURTH_QUARTILE";
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeWeeks(calendar) {
  return calendar.weeks.slice(-53).map((week) => ({
    contributionDays: week.contributionDays.map((day) => ({
      ...day,
      level: LEVELS[day.contributionLevel] ?? levelFromCount(day.contributionCount),
    })),
  }));
}

function plantMarkup(level, color, palette, seed) {
  if (level === 1) {
    return `
      <path d="M0 0V-6" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M0-3C-4-7-5-2 0-1M0-4C4-8 5-3 0-2" fill="${color}" opacity=".82"/>`;
  }

  if (level === 2) {
    const flower = seed % 3 === 0 ? palette.flower : color;
    return `
      <path d="M0 0V-8" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M0-4C-4-7-5-3 0-2M0-5C4-8 5-4 0-3" fill="${color}" opacity=".78"/>
      <g fill="${flower}">
        <circle cx="0" cy="-10" r="2.2"/><circle cx="2.6" cy="-8.4" r="2.2"/>
        <circle cx="1.6" cy="-5.8" r="2.2"/><circle cx="-1.6" cy="-5.8" r="2.2"/>
        <circle cx="-2.6" cy="-8.4" r="2.2"/>
      </g>
      <circle cx="0" cy="-8" r="1.6" fill="${palette.flowerCore}"/>`;
  }

  if (level === 3) {
    return `
      <path d="M0 0V-8M0-5L-4-9M0-6L4-11" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="-4" cy="-10" r="4" fill="${color}"/>
      <circle cx="1" cy="-11" r="5" fill="${color}"/>
      <circle cx="5" cy="-9" r="3.5" fill="${color}"/>
      <circle cx="-1" cy="-14" r="3.6" fill="${color}"/>`;
  }

  return `
    <path d="M0 0V-10" stroke="${palette.soilEdge}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="-3" cy="-14" r="5" fill="${color}"/>
    <circle cx="3" cy="-15" r="6" fill="${color}"/>
    <circle cx="0" cy="-20" r="5" fill="${color}"/>
    <circle cx="6" cy="-19" r="4" fill="${color}"/>
    <circle cx="-5" cy="-19" r="4.5" fill="${color}"/>`;
}

function monthLabels(weeks, originX, stepX) {
  const labels = [];
  let lastMonth = -1;

  weeks.forEach((week, index) => {
    const firstDay = week.contributionDays[0];
    if (!firstDay) return;
    const month = Number(firstDay.date.slice(5, 7)) - 1;
    const day = Number(firstDay.date.slice(8, 10));
    if (month !== lastMonth && day <= 7) {
      labels.push(`<text x="${originX + index * stepX}" y="96" class="month">${
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month]
      }</text>`);
      lastMonth = month;
    }
  });

  return labels.join("");
}

function renderSvg(calendar, login, mode) {
  const palette = themes[mode];
  const weeks = normalizeWeeks(calendar);
  const width = 900;
  const height = 310;
  const originX = 104;
  const originY = 116;
  const stepX = 14.2;
  const stepY = 14;
  const tileWidth = 10;
  const tileHeight = 7;
  const plantParts = [];
  const soilParts = [];
  const values = [];

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      const x = originX + weekIndex * stepX;
      const y = originY + day.weekday * stepY;
      const level = Number(day.level) || 0;
      values.push(`${day.date}: ${day.contributionCount}`);
      soilParts.push(`
        <rect x="${x - tileWidth / 2}" y="${y - 1}" width="${tileWidth}" height="${tileHeight}"
          rx="2" fill="${level ? palette.soil : palette.level[0]}" stroke="${level ? palette.soilEdge : palette.grid}"
          stroke-width=".7"><title>${xml(day.date)}: ${day.contributionCount} contributions</title></rect>`);

      if (level > 0) {
        const reveal = (0.08 + weekIndex * 0.006).toFixed(3);
        const grown = Math.min(0.82, Number(reveal) + 0.08).toFixed(3);
        const plant = plantMarkup(level, palette.level[level], palette, weekIndex * 7 + day.weekday);
        plantParts.push(`
          <g transform="translate(${x} ${y})">
            <g class="plant">
              ${plant}
              <animateTransform attributeName="transform" type="scale"
                values=".08 .08;.08 .08;1 1;1 1;.08 .08"
                keyTimes="0;${reveal};${grown};.9;1" dur="16s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0;0;1;1;0"
                keyTimes="0;${reveal};${grown};.94;1" dur="16s" repeatCount="indefinite"/>
            </g>
          </g>`);
      }
    });
  });

  const newestDay = weeks.at(-1)?.contributionDays.at(-1);
  const activeDays = weeks.flatMap((week) => week.contributionDays).filter((day) => day.contributionCount > 0).length;
  const title = `${login}'s contribution garden`;
  const description = `${calendar.totalContributions} contributions across ${activeDays} active days. Each soil plot is one day; larger plants represent more contributions. ${values.join(", ")}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${xml(title)}</title>
  <desc id="desc">${xml(description)}</desc>
  <style>
    text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .heading { fill: ${palette.text}; font-size: 19px; font-weight: 650; }
    .subheading { fill: ${palette.muted}; font-size: 12px; }
    .month, .weekday { fill: ${palette.muted}; font-size: 10px; }
    .stat { fill: ${palette.text}; font-size: 12px; font-weight: 600; }
    .plant { transform-box: fill-box; transform-origin: center bottom; }
    .firefly { animation: twinkle 2.8s ease-in-out infinite alternate; }
    @keyframes twinkle { from { opacity: .15; } to { opacity: .85; } }
    @media (prefers-reduced-motion: reduce) {
      animate, animateTransform { display: none; }
      .plant { opacity: 1; transform: scale(1); }
      .firefly { animation: none; }
    }
  </style>

  <rect width="900" height="310" rx="16" fill="${palette.surface}"/>
  <rect x="18" y="18" width="864" height="274" rx="13" fill="${palette.panel}" stroke="${palette.grid}"/>

  <text x="42" y="54" class="heading">${xml(login)}'s code garden</text>
  <text x="42" y="76" class="subheading">Every contribution helps something grow.</text>
  <g transform="translate(674 42)">
    <text x="0" y="0" class="stat">${calendar.totalContributions.toLocaleString("en-US")}</text>
    <text x="0" y="18" class="subheading">contributions</text>
    <text x="102" y="0" class="stat">${activeDays}</text>
    <text x="102" y="18" class="subheading">active days</text>
  </g>

  ${monthLabels(weeks, originX, stepX)}
  <text x="70" y="135" text-anchor="end" class="weekday">Mon</text>
  <text x="70" y="163" text-anchor="end" class="weekday">Wed</text>
  <text x="70" y="191" text-anchor="end" class="weekday">Fri</text>

  <path d="M88 214H857" stroke="${palette.grid}" stroke-width="1"/>
  ${soilParts.join("")}
  ${plantParts.join("")}

  <g class="firefly" fill="${palette.sun}">
    <circle cx="156" cy="107" r="1.6"/><circle cx="422" cy="142" r="1.3"/><circle cx="719" cy="112" r="1.5"/>
  </g>

  <g transform="translate(86 227)">
    <g>
      <ellipse cx="23" cy="23" rx="25" ry="3" fill="${palette.grid}" opacity=".75"/>

      <g>
        <circle cx="8" cy="17" r="7" fill="${palette.text}"/>
        <circle cx="8" cy="17" r="3" fill="${palette.robotLight}" stroke="${palette.robot}" stroke-width="1.5"/>
        <path d="M8 14v6M5 17h6" stroke="${palette.robot}" stroke-width="1" opacity=".8"/>
        <animateTransform attributeName="transform" type="rotate" values="0 8 17;360 8 17" dur="1.4s" repeatCount="indefinite"/>
      </g>
      <g>
        <circle cx="37" cy="17" r="7" fill="${palette.text}"/>
        <circle cx="37" cy="17" r="3" fill="${palette.robotLight}" stroke="${palette.robot}" stroke-width="1.5"/>
        <path d="M37 14v6M34 17h6" stroke="${palette.robot}" stroke-width="1" opacity=".8"/>
        <animateTransform attributeName="transform" type="rotate" values="0 37 17;360 37 17" dur="1.4s" repeatCount="indefinite"/>
      </g>

      <path d="M2 3Q2-1 7-1H39Q44-1 44 4V13Q44 17 39 17H7Q2 17 2 12Z"
        fill="${palette.robotLight}" stroke="${palette.robot}" stroke-width="1.8"/>
      <path d="M5 1H12V15H7Q4 15 4 12V4Q4 2 5 1Z" fill="${palette.level[2]}" opacity=".9"/>
      <circle cx="8" cy="6" r="2.2" fill="none" stroke="${palette.robotLight}" stroke-width="1.2"/>
      <path d="M8 8.2v3" stroke="${palette.robotLight}" stroke-width="1.2" stroke-linecap="round"/>

      <path d="M15-2v-3Q15-14 24-14H31Q39-14 39-6v4" fill="${palette.robotLight}"
        stroke="${palette.robot}" stroke-width="1.8"/>
      <path d="M19-11Q24-15 31-12Q36-10 36-5H18Q18-9 19-11Z" fill="${palette.level[1]}" opacity=".9"/>
      <circle cx="24" cy="-6" r="1.8" fill="${palette.text}"/>
      <circle cx="32" cy="-6" r="1.8" fill="${palette.text}"/>
      <path d="M26-2.5Q28 0 31-2.5" fill="none" stroke="${palette.robot}" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M28-14v-5" stroke="${palette.robot}" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="28" cy="-21" r="2.3" fill="${palette.flowerCore}">
        <animate attributeName="opacity" values=".35;1;.35" dur="1.6s" repeatCount="indefinite"/>
      </circle>

      <g>
        <path d="M43 3Q51-1 55-7" fill="none" stroke="${palette.robot}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="44" cy="3" r="2.5" fill="${palette.level[2]}"/>
        <path d="M54-8l7 4-3 5-7-4Z" fill="${palette.robotLight}" stroke="${palette.robot}" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M60-1Q66 3 68 9" fill="none" stroke="${palette.water}" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 3">
          <animate attributeName="stroke-dashoffset" values="0;-10" dur=".7s" repeatCount="indefinite"/>
        </path>
        <circle cx="68" cy="11" r="1.8" fill="${palette.water}">
          <animate attributeName="cy" values="7;16" dur=".8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;1;0" dur=".8s" repeatCount="indefinite"/>
        </circle>
        <animateTransform attributeName="transform" type="rotate" values="-3 44 3;4 44 3;-3 44 3" dur="1.8s" repeatCount="indefinite"/>
      </g>

      <animateTransform attributeName="transform" type="translate"
        values="0 0;708 0;708 0;0 0;0 0" keyTimes="0;.42;.52;.94;1" dur="16s" repeatCount="indefinite"/>
    </g>
  </g>

  <g transform="translate(42 273)">
    <text x="0" y="0" class="subheading">Less</text>
    ${[0, 1, 2, 3, 4].map((level) => `<circle cx="${40 + level * 20}" cy="-4" r="5" fill="${palette.level[level]}"/>`).join("")}
    <text x="146" y="0" class="subheading">More</text>
    <text x="814" y="0" text-anchor="end" class="subheading">Updated ${xml(newestDay?.date ?? "today")}</text>
  </g>
</svg>`;
}

async function main() {
  const calendar = isDemo
    ? demoCalendar()
    : await fetchCalendar(username, process.env.GITHUB_TOKEN);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(new URL("contribution-garden.svg", OUTPUT_DIR), renderSvg(calendar, username, "light")),
    writeFile(new URL("contribution-garden-dark.svg", OUTPUT_DIR), renderSvg(calendar, username, "dark")),
    writeFile(
      new URL("garden-summary.json", OUTPUT_DIR),
      `${JSON.stringify({ username, totalContributions: calendar.totalContributions, weeks: normalizeWeeks(calendar) }, null, 2)}\n`,
    ),
  ]);

  console.log(`Garden generated for ${username}: ${calendar.totalContributions} contributions.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

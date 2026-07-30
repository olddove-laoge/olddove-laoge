import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const ROOT = new URL("./", import.meta.url);
const DIST = new URL("./dist/", ROOT);
const demo = process.argv.includes("--demo");

const CONFIG = JSON.parse(await readFile(new URL("./config.json", ROOT), "utf8"));
const username = process.env.GITHUB_USERNAME || CONFIG.username || "olddove-laoge";

const THEMES = {
  light: {
    background: "#D8D0C5",
    panel: "#E8E1D6",
    grid: "#C7BEB1",
    orbit: "#4B4945",
    text: "#302F2C",
    muted: "#716C64",
    sunA: "#E8E1D6",
    sunB: "#A95654",
    corona: "#A95654",
    planets: ["#9F524D", "#485FA5", "#B89A43"],
    planetInk: "#302F2C",
    label: "#E8E1D6",
    labelBorder: "#57534D",
    signal: "#8E625E",
    star: "#817B72",
  },
  dark: {
    background: "#191816",
    panel: "#242321",
    grid: "#3B3833",
    orbit: "#A39B90",
    text: "#E7E0D5",
    muted: "#AAA299",
    sunA: "#DDD5C9",
    sunB: "#B96A64",
    corona: "#B96A64",
    planets: ["#B96A64", "#5B72B8", "#C0A251"],
    planetInk: "#E7E0D5",
    label: "#292724",
    labelBorder: "#8E877D",
    signal: "#B27B74",
    star: "#9B948A",
  },
};

const PLANET_LAYOUTS = [
  { x: 603, y: 183, labelX: 648, labelY: 120, anchor: "start", orbit: 0 },
  { x: 300, y: 132, labelX: 66, labelY: 78, anchor: "start", orbit: 1 },
  { x: 590, y: 282, labelX: 648, labelY: 246, anchor: "start", orbit: 2 },
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function compact(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function truncate(value, max = 22) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function github(path, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-code-solar-system",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchRepositories() {
  const metadataToken = process.env.TRAFFIC_TOKEN || process.env.GITHUB_TOKEN;
  const repos = await github(`/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=updated`, metadataToken);
  const excluded = new Set([...(CONFIG.exclude || []), username]);
  const candidates = repos.filter((repo) => !repo.fork && !repo.archived && !excluded.has(repo.name));
  const trafficToken = process.env.TRAFFIC_TOKEN;

  if (trafficToken) {
    await Promise.all(candidates.map(async (repo) => {
      try {
        const traffic = await github(`/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo.name)}/traffic/views`, trafficToken);
        repo.traffic = { views: traffic.count, uniques: traffic.uniques };
      } catch (error) {
        console.warn(`Traffic unavailable for ${repo.name}: ${error.message}`);
        repo.traffic = null;
      }
    }));
  }

  return candidates.map((repo) => ({
    name: repo.name,
    url: repo.html_url,
    description: repo.description || "",
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language || "Other",
    updatedAt: repo.updated_at,
    views: repo.traffic?.views ?? null,
    visitors: repo.traffic?.uniques ?? null,
  }));
}

function demoRepositories() {
  return [
    { name: "academic-homepage", url: "https://github.com/olddove-laoge/academic-homepage", stars: 128, forks: 18, language: "TypeScript", views: 1240, visitors: 386 },
    { name: "mathmodel", url: "https://github.com/olddove-laoge/mathmodel", stars: 74, forks: 9, language: "Python", views: 684, visitors: 241 },
    { name: "MCM", url: "https://github.com/olddove-laoge/MCM", stars: 31, forks: 4, language: "Jupyter Notebook", views: 326, visitors: 119 },
  ];
}

function score(repo) {
  return repo.stars * 5 + repo.forks * 2 + (repo.visitors || 0) * 3 + (repo.views || 0) * 0.5;
}

function selectProjects(repositories) {
  const byName = new Map(repositories.map((repo) => [repo.name, repo]));
  const pinned = (CONFIG.pinned || []).map((name) => byName.get(name)).filter(Boolean);
  const selected = [...pinned];
  for (const repo of [...repositories].sort((a, b) => score(b) - score(a) || b.stars - a.stars || a.name.localeCompare(b.name))) {
    if (!selected.some((item) => item.name === repo.name)) selected.push(repo);
    if (selected.length >= Math.min(3, CONFIG.projectCount || 3)) break;
  }
  return selected.slice(0, 3);
}

function profileViewsValue() {
  const raw = process.env.PROFILE_VIEWS ?? CONFIG.profileViews;
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function radiusFor(stars, maxStars) {
  if (maxStars === 0) return 17;
  return Math.round(15 + 10 * Math.sqrt(stars / maxStars));
}

function satellitesFor(forks) {
  if (forks <= 0) return 0;
  if (forks <= 5) return 1;
  if (forks <= 20) return 2;
  return 3;
}

function stableColorIndex(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % 3;
}

function starsMarkup(theme) {
  const points = [];
  for (let i = 0; i < 48; i += 1) {
    const x = 28 + ((i * 137) % 842);
    const y = 26 + ((i * 83) % 322);
    if (x > 370 && x < 535 && y > 115 && y < 285) continue;
    const r = i % 9 === 0 ? 1.3 : i % 4 === 0 ? 0.9 : 0.55;
    points.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${theme.star}" opacity="${i % 3 === 0 ? ".55" : ".28"}"/>`);
  }
  return points.join("");
}

function satelliteMarkup(count, radius, color, ink) {
  if (!count) return "";
  const satellites = [];
  const orbitRadius = radius + 11;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    satellites.push(`<circle cx="${(Math.cos(angle) * orbitRadius).toFixed(1)}" cy="${(Math.sin(angle) * orbitRadius * 0.4).toFixed(1)}" r="2.2" fill="${color}" stroke="${ink}" stroke-width="1.2"/>`);
  }
  return `
    <g class="satellites">
      <ellipse rx="${orbitRadius}" ry="${(orbitRadius * 0.4).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="1" opacity=".28"/>
      ${satellites.join("")}
      <animateTransform attributeName="transform" type="rotate" values="0;360" dur="${8 + count * 2}s" repeatCount="indefinite"/>
    </g>`;
}

function planetMarkup(repo, index, maxStars, theme) {
  const layout = PLANET_LAYOUTS[index];
  const radius = radiusFor(repo.stars, maxStars);
  const colorIndex = stableColorIndex(repo.name);
  const color = theme.planets[colorIndex];
  const satelliteCount = satellitesFor(repo.forks);
  const traffic = repo.views === null
    ? "Traffic unavailable"
    : `${repo.views.toLocaleString("en-US")} views · ${repo.visitors.toLocaleString("en-US")} visitors`;
  const pulseDuration = repo.views ? Math.max(3, 8 - Math.log10(repo.views + 1)).toFixed(1) : "7";
  const labelWidth = 216;
  const name = truncate(repo.name);
  const title = `${repo.name}: ${repo.stars} stars, ${repo.forks} forks, ${traffic}, language ${repo.language}`;

  const motif = index === 0
    ? `<rect x="-${radius * .68}" y="-${radius * .68}" width="${radius * 1.36}" height="${radius * 1.36}" fill="${color}" stroke="${theme.planetInk}" stroke-width="2.4" transform="rotate(45)"/>
       <circle r="${radius * .48}" fill="${theme.label}" stroke="${theme.planetInk}" stroke-width="2"/>
       <path d="M-${radius * .42} 0H${radius * .42}" stroke="${color}" stroke-width="${Math.max(4, radius * .18)}"/>`
    : index === 1
      ? `<circle r="${radius}" fill="${color}" stroke="${theme.planetInk}" stroke-width="2.4"/>
         <rect x="-${radius * 1.25}" y="-5" width="${radius * 2.5}" height="10" fill="${theme.label}" stroke="${theme.planetInk}" stroke-width="2" transform="rotate(-18)"/>
         <circle r="${radius * .24}" fill="${theme.planetInk}"/>`
      : `<path d="M0-${radius}L${radius * .9} ${radius * .62}L-${radius * .9} ${radius * .62}Z" fill="${color}" stroke="${theme.planetInk}" stroke-width="2.4" stroke-linejoin="miter"/>
         <circle cy="${radius * .18}" r="${radius * .3}" fill="${theme.label}" stroke="${theme.planetInk}" stroke-width="2"/>`;

  return `
    <g transform="translate(${layout.x} ${layout.y})">
      <g class="planet-float planet-${index + 1}">
        <title>${escapeXml(title)}</title>
        ${repo.views !== null ? `<circle r="${radius + 8}" fill="none" stroke="${theme.signal}" stroke-width="2" opacity="0">
          <animate attributeName="r" values="${radius + 3};${radius + 17}" dur="${pulseDuration}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values=".55;0" dur="${pulseDuration}s" repeatCount="indefinite"/>
        </circle>` : ""}
        ${motif}
        ${satelliteMarkup(satelliteCount, radius, color, theme.planetInk)}
      </g>
    </g>

    <g transform="translate(${layout.labelX} ${layout.labelY})">
      <rect width="${labelWidth}" height="82" fill="${theme.label}" stroke="${theme.labelBorder}" stroke-width="2"/>
      <rect width="8" height="82" fill="${color}"/>
      <text x="18" y="22" class="project-name">${escapeXml(name)}</text>
      <text x="16" y="46" class="metric">★ ${repo.stars.toLocaleString("en-US")} <tspan class="divider">·</tspan> ⑂ ${repo.forks.toLocaleString("en-US")}</text>
      <text x="16" y="65" class="traffic">${escapeXml(traffic)}</text>
      <text x="${labelWidth - 10}" y="21" text-anchor="end" class="rank">0${index + 1}</text>
    </g>`;
}

function renderSvg(repositories, mode, views, isDemo) {
  const theme = THEMES[mode];
  const projects = selectProjects(repositories);
  const maxStars = Math.max(0, ...projects.map((repo) => repo.stars));
  const totalStars = projects.reduce((sum, repo) => sum + repo.stars, 0);
  const totalViews = projects.reduce((sum, repo) => sum + (repo.views || 0), 0);
  const hasTraffic = projects.some((repo) => repo.views !== null);
  const viewText = views === null ? "NOT CONNECTED" : views.toLocaleString("en-US");
  const viewSubtext = views === null ? "PROFILE COUNTER" : "TRACKED VIEWS";
  const since = CONFIG.profileViewsSince ? `SINCE ${String(CONFIG.profileViewsSince).toUpperCase()}` : "PROFILE SIGNAL";
  const descriptions = projects.map((repo, index) => `Rank ${index + 1}: ${repo.name}, ${repo.stars} stars, ${repo.forks} forks, ${repo.views ?? "unknown"} views`).join(". ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="380" viewBox="0 0 900 380" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)}'s code solar system</title>
  <desc id="desc">The central star represents profile views and the three planets represent popular repositories. ${escapeXml(descriptions)}.</desc>
  <defs>
    <filter id="sun-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>
  <style>
    text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .heading { fill: ${theme.text}; font-size: 18px; font-weight: 700; letter-spacing: .4px; }
    .subheading { fill: ${theme.muted}; font-size: 11px; letter-spacing: .7px; }
    .project-name { fill: ${theme.text}; font-size: 13px; font-weight: 700; }
    .metric { fill: ${theme.text}; font-size: 12px; font-weight: 650; }
    .traffic { fill: ${theme.muted}; font-size: 10.5px; }
    .rank { fill: ${theme.muted}; font-size: 10px; font-weight: 700; }
    .divider { fill: ${theme.muted}; }
    .sun-number { fill: #3B2A00; font-size: ${views === null ? "10px" : "19px"}; font-weight: 800; letter-spacing: ${views === null ? ".5px" : "0"}; }
    .sun-label { fill: ${theme.sunA}; font-size: 8px; font-weight: 700; letter-spacing: .8px; paint-order: stroke; stroke: ${theme.sunB}; stroke-width: 1.5px; stroke-linejoin: round; }
    .planet-float { transform-box: fill-box; transform-origin: center; }
    .planet-1 { animation: drift1 6s ease-in-out infinite alternate; }
    .planet-2 { animation: drift2 7.5s ease-in-out infinite alternate; }
    .planet-3 { animation: drift3 8.5s ease-in-out infinite alternate; }
    .sun-core { animation: breathe 4.5s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
    @keyframes drift1 { to { transform: translate(3px, -4px); } }
    @keyframes drift2 { to { transform: translate(-4px, 3px); } }
    @keyframes drift3 { to { transform: translate(3px, 4px); } }
    @keyframes breathe { to { transform: scale(1.045); } }
    @media (prefers-reduced-motion: reduce) {
      .planet-float, .sun-core { animation: none; }
      animate, animateTransform { display: none; }
    }
  </style>

  <rect width="900" height="380" fill="${theme.background}"/>
  <rect x="18" y="18" width="864" height="344" fill="${theme.panel}" stroke="${theme.planetInk}" stroke-width="2"/>
  <path d="M18 18H278L214 82H18ZM882 362H650L714 298H882Z" fill="${theme.sunB}"/>
  <path d="M318 18H368L252 134H202ZM882 86V133L752 263H705Z" fill="${theme.planets[1]}" opacity=".92"/>
  <g opacity=".08" fill="${theme.planetInk}">
    ${Array.from({ length: 11 }, (_, index) => `<rect x="${28 + index * 82}" y="18" width="1" height="344"/>`).join("")}
  </g>
  ${starsMarkup(theme)}
  <path d="M42 62H858" stroke="${theme.planetInk}" stroke-width="2"/>
  <rect x="42" y="28" width="8" height="22" fill="${theme.sunB}"/>
  <text x="60" y="46" class="heading">${escapeXml(username)} · CODE SOLAR SYSTEM</text>
  <text x="858" y="46" text-anchor="end" class="subheading">${isDemo ? "CONCEPT / DEMO DATA" : "LIVE GITHUB DATA"}</text>

  <g fill="none" stroke="${theme.orbit}" stroke-width="1.5" opacity=".55">
    <ellipse cx="450" cy="202" rx="160" ry="63"/>
    <ellipse cx="450" cy="202" rx="247" ry="105" stroke-dasharray="10 5"/>
    <ellipse cx="450" cy="202" rx="330" ry="142" stroke-dasharray="3 7"/>
  </g>
  <g fill="${theme.signal}">
    <circle cx="386" cy="144" r="2"><animate attributeName="opacity" values=".15;1;.15" dur="3s" repeatCount="indefinite"/></circle>
    <circle cx="220" cy="215" r="1.8"><animate attributeName="opacity" values="1;.15;1" dur="4s" repeatCount="indefinite"/></circle>
    <circle cx="735" cy="235" r="1.6"><animate attributeName="opacity" values=".2;1;.2" dur="5s" repeatCount="indefinite"/></circle>
  </g>

  <g transform="translate(450 202)">
    <g class="sun-core">
      <g fill="${theme.sunB}" stroke="${theme.planetInk}" stroke-width="1.8">
        <path d="M0-75L10-55H-10Z"/><path d="M0 75L-10 55H10Z"/>
        <path d="M-75 0L-55-10V10Z"/><path d="M75 0L55 10V-10Z"/>
        <path d="M-53-53L-32-45L-45-32Z"/><path d="M53 53L32 45L45 32Z"/>
        <path d="M53-53L45-32L32-45Z"/><path d="M-53 53L-45 32L-32 45Z"/>
      </g>
      <circle r="54" fill="${theme.sunB}" stroke="${theme.planetInk}" stroke-width="3"/>
      <rect x="-54" y="-9" width="108" height="18" fill="${theme.sunA}" stroke="${theme.planetInk}" stroke-width="2"/>
      <circle r="36" fill="none" stroke="${theme.planetInk}" stroke-width="2"/>
      <text y="-20" text-anchor="middle" class="sun-label">${escapeXml(viewSubtext)}</text>
      <text y="5" text-anchor="middle" class="sun-number">${escapeXml(viewText)}</text>
      <text y="27" text-anchor="middle" class="sun-label">${escapeXml(since)}</text>
    </g>
  </g>

  ${projects.map((repo, index) => planetMarkup(repo, index, maxStars, theme)).join("")}

  <g transform="translate(42 341)">
    <text class="subheading">${projects.length} PLANETS</text>
    <text x="105" class="subheading">★ ${totalStars.toLocaleString("en-US")} STARS</text>
    <text x="220" class="subheading">${hasTraffic ? `${totalViews.toLocaleString("en-US")} VIEWS · LAST 14 DAYS` : "TRAFFIC REQUIRES TOKEN"}</text>
    <text x="816" text-anchor="end" class="subheading">UPDATED DAILY · PLANET SIZE = STARS</text>
  </g>
</svg>`;
}

async function main() {
  const repositories = demo ? demoRepositories() : await fetchRepositories();
  if (!repositories.length) throw new Error(`No eligible public repositories found for ${username}.`);
  const views = demo ? 12482 : profileViewsValue();

  await mkdir(DIST, { recursive: true });
  const selected = selectProjects(repositories);
  await Promise.all([
    writeFile(new URL("code-solar-system.svg", DIST), renderSvg(repositories, "light", views, demo)),
    writeFile(new URL("code-solar-system-dark.svg", DIST), renderSvg(repositories, "dark", views, demo)),
    writeFile(new URL("solar-summary.json", DIST), `${JSON.stringify({ username, profileViews: views, demo, projects: selected }, null, 2)}\n`),
  ]);

  console.log(`Code solar system generated for ${username}: ${selected.map((repo) => repo.name).join(", ")}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

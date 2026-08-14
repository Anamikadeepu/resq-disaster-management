// ==============================================================
// WEATHER / RAINFALL ALERTS SERVICE
// ==============================================================
//
// Uses Open-Meteo (https://open-meteo.com) — a free, real-time
// weather API that needs NO API key, NO signup and NO billing.
// It is rate-limited to fair personal/non-commercial use, which
// is perfect for a project like this.
//
// If you later want India-specific official warnings (IMD /
// NDMA style bulletins) you can additionally poll the IMD or
// data.gov.in feeds, or upgrade to OpenWeatherMap's "Alerts"
// endpoint (needs a free API key). This file is the single
// place you'd add that.
// ==============================================================

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes -> human readable text + emoji icon
// https://open-meteo.com/en/docs (see "WMO Weather interpretation codes")
const WEATHER_CODES = {
  0: { text: "Clear sky", icon: "☀️" },
  1: { text: "Mainly clear", icon: "🌤️" },
  2: { text: "Partly cloudy", icon: "⛅" },
  3: { text: "Overcast", icon: "☁️" },
  45: { text: "Fog", icon: "🌫️" },
  48: { text: "Depositing rime fog", icon: "🌫️" },
  51: { text: "Light drizzle", icon: "🌦️" },
  53: { text: "Moderate drizzle", icon: "🌦️" },
  55: { text: "Dense drizzle", icon: "🌧️" },
  56: { text: "Light freezing drizzle", icon: "🌧️" },
  57: { text: "Dense freezing drizzle", icon: "🌧️" },
  61: { text: "Slight rain", icon: "🌦️" },
  63: { text: "Moderate rain", icon: "🌧️" },
  65: { text: "Heavy rain", icon: "🌧️" },
  66: { text: "Light freezing rain", icon: "🌧️" },
  67: { text: "Heavy freezing rain", icon: "🌧️" },
  71: { text: "Slight snow fall", icon: "🌨️" },
  73: { text: "Moderate snow fall", icon: "🌨️" },
  75: { text: "Heavy snow fall", icon: "❄️" },
  77: { text: "Snow grains", icon: "❄️" },
  80: { text: "Slight rain showers", icon: "🌦️" },
  81: { text: "Moderate rain showers", icon: "🌧️" },
  82: { text: "Violent rain showers", icon: "⛈️" },
  85: { text: "Slight snow showers", icon: "🌨️" },
  86: { text: "Heavy snow showers", icon: "❄️" },
  95: { text: "Thunderstorm", icon: "⛈️" },
  96: { text: "Thunderstorm with hail", icon: "⛈️" },
  99: { text: "Severe thunderstorm with hail", icon: "⛈️" },
};

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] || { text: "Unknown", icon: "🌡️" };
}

// --------------------------------------------------------------
// Fetch current + short-term forecast weather for a coordinate
// --------------------------------------------------------------

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current:
      "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    hourly: "precipitation_probability,precipitation,weather_code",
    daily:
      "precipitation_probability_max,precipitation_sum,weather_code,temperature_2m_max,temperature_2m_min",
    forecast_days: "3",
    timezone: "auto",
  });

  const response = await fetch(`${FORECAST_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Weather request failed (${response.status})`);
  }

  const data = await response.json();
  return buildWeatherSummary(data);
}

// --------------------------------------------------------------
// Turn the raw Open-Meteo payload into what the UI needs:
// current conditions + derived alerts + safety tips
// --------------------------------------------------------------

function buildWeatherSummary(data) {
  const current = data.current || {};
  const hourly = data.hourly || {};
  const daily = data.daily || {};

  const currentWeather = describeWeatherCode(current.weather_code);

  // Look at the next 12 hours of hourly data (from "now") to
  // judge how imminent heavy rain is.
  const nowIndex = findCurrentHourIndex(hourly.time, data.current?.time);

  const next12hProbabilities = (hourly.precipitation_probability || [])
    .slice(nowIndex, nowIndex + 12)
    .filter((value) => typeof value === "number");

  const next12hRainSum = (hourly.precipitation || [])
    .slice(nowIndex, nowIndex + 12)
    .reduce((sum, value) => sum + (value || 0), 0);

  const maxProbabilityNext12h = next12hProbabilities.length
    ? Math.max(...next12hProbabilities)
    : 0;

  const todayPrecipSum = daily.precipitation_sum?.[0] ?? 0;
  const todayMaxProbability = daily.precipitation_probability_max?.[0] ?? 0;

  // --- Heavy rainfall alert thresholds ---
  // >70% chance of rain in the next 12h OR >15mm expected in
  // that window OR >30mm expected for the whole day.
  const heavyRainfallAlert =
    maxProbabilityNext12h >= 70 ||
    next12hRainSum >= 15 ||
    todayPrecipSum >= 30;

  const moderateRainWatch =
    !heavyRainfallAlert &&
    (maxProbabilityNext12h >= 40 || todayPrecipSum >= 10);

  // --- General weather alerts (wind / thunderstorm / heat) ---
  const windSpeed = current.wind_speed_10m ?? 0;
  const isThunderstorm = [95, 96, 99].includes(current.weather_code);
  const isExtremeHeat = (current.temperature_2m ?? 0) >= 40;

  const generalAlerts = [];

  if (isThunderstorm) {
    generalAlerts.push({
      title: "⛈️ Thunderstorm Warning",
      message:
        "Thunderstorm activity detected in your area. Avoid open fields, tall isolated trees and unsafe structures.",
    });
  }

  if (windSpeed >= 40) {
    generalAlerts.push({
      title: "💨 High Wind Warning",
      message: `Strong winds of ~${Math.round(
        windSpeed
      )} km/h are being recorded. Secure loose objects and avoid unstable structures.`,
    });
  }

  if (isExtremeHeat) {
    generalAlerts.push({
      title: "🌡️ Extreme Heat Warning",
      message:
        "Temperatures are dangerously high. Stay hydrated, avoid direct sun between 12–4pm, and watch for heat exhaustion symptoms.",
    });
  }

  // --- Dynamic safety tips ---
  const safetyTips = [];

  if (heavyRainfallAlert) {
    safetyTips.push(
      "Avoid flooded or waterlogged roads — even shallow fast-moving water can sweep away vehicles."
    );
    safetyTips.push(
      "Move valuables and important documents to higher ground if you're in a low-lying area."
    );
  } else if (moderateRainWatch) {
    safetyTips.push(
      "Rain is likely later today — keep an umbrella/raincoat handy and check drainage near your home."
    );
  }

  if (isThunderstorm) {
    safetyTips.push(
      "Stay indoors, unplug electronics and avoid using landline phones during lightning."
    );
  }

  if (isExtremeHeat) {
    safetyTips.push(
      "Drink water regularly and avoid strenuous outdoor activity during peak heat hours."
    );
  }

  if (safetyTips.length === 0) {
    safetyTips.push(
      "No active weather hazards right now. Keep your SOS contacts and emergency kit ready as always."
    );
  }

  safetyTips.push(
    "Follow official alerts from local authorities and evacuate immediately if instructed."
  );

  return {
    fetchedAt: new Date().toISOString(),
    location: {
      timezone: data.timezone,
    },
    current: {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      precipitation: current.precipitation,
      code: current.weather_code,
      text: currentWeather.text,
      icon: currentWeather.icon,
    },
    rainfall: {
      heavyRainfallAlert,
      moderateRainWatch,
      maxProbabilityNext12h: Math.round(maxProbabilityNext12h),
      next12hRainSum: Math.round(next12hRainSum * 10) / 10,
      todayPrecipSum: Math.round(todayPrecipSum * 10) / 10,
      todayMaxProbability: Math.round(todayMaxProbability),
    },
    generalAlerts,
    safetyTips,
    daily: (daily.time || []).map((date, index) => ({
      date,
      maxTemp: daily.temperature_2m_max?.[index],
      minTemp: daily.temperature_2m_min?.[index],
      precipSum: daily.precipitation_sum?.[index],
      precipProbability: daily.precipitation_probability_max?.[index],
      code: daily.weather_code?.[index],
    })),
  };
}

function findCurrentHourIndex(hourlyTimes, currentTimeIso) {
  if (!hourlyTimes || !currentTimeIso) return 0;

  // Open-Meteo's hourly timestamps look like "2026-08-14T15:00",
  // current.time looks like "2026-08-14T15:07" — match by hour.
  const currentHourKey = currentTimeIso.slice(0, 13);

  const index = hourlyTimes.findIndex(
    (time) => time.slice(0, 13) === currentHourKey
  );

  return index === -1 ? 0 : index;
}
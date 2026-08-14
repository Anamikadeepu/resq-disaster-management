import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import safehelpImage from "./assets/safehelp.png";
import floodImage from "./assets/flood.png";
import {
  fetchNearbyHospitals,
  fetchNearbyShelters,
} from "./services/places";
import { fetchWeather } from "./services/weather";
import LiveMap from "./components/LiveMap";
import {
  getAssistantReply,
  ASSISTANT_SUGGESTIONS,
} from "./services/assistant";

// ==============================================================
// OFFICIAL INDIA EMERGENCY HELPLINES
// Source: Government of India — Incredible India official
// emergency numbers page (verified — see data-source-note below
// wherever this is shown). These are static reference numbers,
// not fetched from an API, since they rarely change.
// ==============================================================

const NATIONAL_HELPLINES = [
  { number: "112", label: "Unified Emergency Number" },
  { number: "100", label: "Police" },
  { number: "101", label: "Fire" },
  { number: "102", label: "Ambulance" },
  { number: "108", label: "Ambulance / Emergency Response" },
  { number: "1091", label: "Women in Distress" },
  { number: "1073", label: "Road Accident" },
  { number: "1092", label: "Earthquake Helpline" },
  { number: "104", label: "Medical Helpline" },
  { number: "1363", label: "Tourist Helpline" },
];

// ==============================================================
// SMALL REUSABLE PIECES
// ==============================================================

function PlaceResultCard({ place, icon }) {
  return (
    <div className="place-card">
      <h3>
        {icon} {place.name}
      </h3>

      <p>📍 {place.distanceKm.toFixed(1)} km away</p>

      {place.address && <p>🏠 {place.address}</p>}

      <p>🏷️ {place.category}</p>

      {place.phone && <p>📞 {place.phone}</p>}

      <div className="place-card-actions">
        <a
          className="direction-button"
          href={place.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Directions
        </a>

        {place.phone && (
          <a
            className="direction-button call-link"
            href={`tel:${place.phone}`}
          >
            📞 Call
          </a>
        )}
      </div>
    </div>
  );
}

function LiveDataStatus({
  coords,
  loading,
  error,
  onRetry,
  loadingText,
}) {
  if (!coords) {
    return (
      <div className="location-missing-box">
        <p>📍 We need your location to find real places nearby.</p>
        <p className="small-note">
          Go back to the safety setup screen and use{" "}
          <strong>“Use Current Location”</strong> or search for a
          place, then come back here.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-box">
        <span className="spinner" />
        {loadingText || "Loading live data..."}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-box">
        <p>{error}</p>

        {onRetry && (
          <button className="direction-button" onClick={onRetry}>
            🔄 Try Again
          </button>
        )}
      </div>
    );
  }

  return null;
}

function App() {
  // ==============================
  // MAIN APP STATES
  // ==============================

  const [started, setStarted] = useState(false);
  const [portal, setPortal] = useState("setup");

  // ==============================
  // LOCATION
  // ==============================

  const [location, setLocation] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  // Real lat/lon coordinates power every live-data feature
  // below (hospitals, shelters, weather). Set either by
  // "Use Current Location" (GPS) or the manual search box.
  const [coords, setCoords] = useState(null);

  // Manual location search (Nominatim geocoding)
  const [manualLocationQuery, setManualLocationQuery] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState("");

  // ==============================
  // SOS CONTACTS
  // ==============================

  const [showSOS, setShowSOS] = useState(false);

  const [sosContacts, setSosContacts] = useState(() => [
    {
      id: Date.now(),
      name: "",
      phone: "",
    },
  ]);

  const [sosSaved, setSosSaved] = useState(false);

  // ==============================
  // CITIZEN PORTAL SECTION
  // ==============================

  const [citizenSection, setCitizenSection] = useState(null);

  // ==============================
  // AI ASSISTANT (rule-based, offline, free)
  // ==============================

  const [aiMessages, setAiMessages] = useState([
    {
      id: "welcome",
      from: "assistant",
      text:
        "👋 Hi, I'm your SafeHelp safety assistant. Ask me about floods, earthquakes, fires, cyclones, finding hospitals/shelters, or how to use SOS.",
    },
  ]);
  const [aiInput, setAiInput] = useState("");

  // ==============================
  // SOS ALERT
  // ==============================

  const [sosAlertSent, setSosAlertSent] = useState(false);

  // ==============================
  // INCIDENT REPORTING
  // ==============================

  const [incidentType, setIncidentType] = useState(null);

  // Reports submitted by the citizen — persisted to
  // localStorage so the Admin Portal can list them too.
  const [incidentReports, setIncidentReports] = useState([]);
  const [reportSubmittedType, setReportSubmittedType] = useState(null);

  const missingPersonDetailsRef = useRef(null);
  const missingPersonPhotoRef = useRef(null);
  const propertyAddressRef = useRef(null);
  const incidentDescriptionRef = useRef(null);

  // ==============================
  // ADMIN PORTAL VIEW
  // ==============================

  const [adminView, setAdminView] = useState(null);

  // Volunteers directory — a simple manually-managed contact
  // list (name, phone, email) so admins can reach volunteers
  // quickly in an urgent situation. Persisted to localStorage,
  // same pattern as the other lists in this app.
  const [volunteers, setVolunteers] = useState([]);
  const [newVolunteerName, setNewVolunteerName] = useState("");
  const [newVolunteerPhone, setNewVolunteerPhone] = useState("");
  const [newVolunteerEmail, setNewVolunteerEmail] = useState("");

  // ==============================
  // RESPONDER PORTAL
  // ==============================

  const [responderSection, setResponderSection] = useState(null);

  // Rescue teams — there's no public API that reports real-world
  // rescue-team availability (that's internal, organisation-specific
  // data), so this is a simple manually-managed roster, persisted to
  // localStorage so it survives a page refresh, same as SOS contacts
  // and incident reports above.
  const [rescueTeams, setRescueTeams] = useState([]);
  const [newTeamName, setNewTeamName] = useState("");

  // ==============================
  // NEARBY HOSPITALS (live data)
  // ==============================

  const [hospitals, setHospitals] = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalsError, setHospitalsError] = useState("");
  const [hospitalsLoadedFor, setHospitalsLoadedFor] = useState(null);

  // ==============================
  // NEARBY SHELTERS (live data)
  // ==============================

  const [shelters, setShelters] = useState([]);
  const [sheltersLoading, setSheltersLoading] = useState(false);
  const [sheltersError, setSheltersError] = useState("");
  const [sheltersLoadedFor, setSheltersLoadedFor] = useState(null);

  // ==============================
  // WEATHER / RAINFALL ALERTS (live data)
  // ==============================

  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoadedFor, setWeatherLoadedFor] = useState(null);

  // ==============================
  // CURRENT LOCATION
  // ==============================

  const getCurrentLocation = () => {
    setLocationMessage("");
    setLocation("");
    setIsDetectingLocation(true);

    if (!navigator.geolocation) {
      setIsDetectingLocation(false);

      setLocationMessage(
        "❌ Location services are not supported by your browser."
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
              headers: {
                Accept: "application/json",
              },
            }
          );

          if (!response.ok) {
            throw new Error("Unable to find location.");
          }

          const data = await response.json();
          const address = data.address || {};

          const place =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.suburb ||
            address.county ||
            "Current location";

          const state = address.state || "";

          const readableLocation = state
            ? `${place}, ${state}`
            : place;

          setLocation(readableLocation);
          setCoords({ lat: latitude, lon: longitude });

          setLocationMessage(
            "✅ Current location detected successfully!"
          );
        } catch (error) {
          console.error(error);

          setLocation("Current location");
          setCoords({ lat: latitude, lon: longitude });

          setLocationMessage(
            "✅ Location detected, but the exact place name could not be found."
          );
        } finally {
          setIsDetectingLocation(false);
        }
      },

      (error) => {
        console.error(error);

        setIsDetectingLocation(false);

        if (error.code === 1) {
          setLocationMessage(
            "❌ Location permission was denied. Please allow location access and try again."
          );
        } else if (error.code === 2) {
          setLocationMessage(
            "❌ Your location could not be determined. Please try again."
          );
        } else if (error.code === 3) {
          setLocationMessage(
            "❌ Location request timed out. Please try again."
          );
        } else {
          setLocationMessage(
            "❌ Something went wrong while detecting your location."
          );
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // ==============================
  // MANUAL LOCATION SEARCH
  // (for people who can't/don't want to share GPS)
  // ==============================

  const searchLocationByName = async () => {
    const query = manualLocationQuery.trim();

    if (!query) {
      setLocationSearchError("Please type a place name to search.");
      return;
    }

    setIsSearchingLocation(true);
    setLocationSearchError("");
    setLocationSearchResults([]);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(
          query
        )}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Search request failed.");
      }

      const results = await response.json();

      if (!results.length) {
        setLocationSearchError(
          "No matching places found. Try a more specific name (e.g. add city/state)."
        );
        return;
      }

      setLocationSearchResults(results);
    } catch (error) {
      console.error(error);
      setLocationSearchError(
        "❌ Could not search for that location. Please check your connection and try again."
      );
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const selectSearchedLocation = (result) => {
    const address = result.address || {};

    const place =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.suburb ||
      address.county ||
      result.display_name?.split(",")[0] ||
      "Selected location";

    const state = address.state || "";

    setLocation(state ? `${place}, ${state}` : place);
    setCoords({
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    });
    setLocationMessage("✅ Location set successfully!");
    setLocationSearchResults([]);
    setManualLocationQuery("");
  };

  // ==============================
  // ADD SOS CONTACT
  // ==============================

  const addContact = () => {
    const newContact = {
      id: Date.now() + Math.random(),
      name: "",
      phone: "",
    };

    setSosContacts((previousContacts) => [
      ...previousContacts,
      newContact,
    ]);

    setSosSaved(false);
  };

  // ==============================
  // REMOVE SOS CONTACT
  // ==============================

  const removeContact = (id) => {
    if (sosContacts.length === 1) {
      alert("Please keep at least one SOS contact.");
      return;
    }

    setSosContacts((previousContacts) =>
      previousContacts.filter(
        (contact) => contact.id !== id
      )
    );

    setSosSaved(false);
  };

  // ==============================
  // UPDATE SOS CONTACT
  // ==============================

  const updateContact = (id, field, value) => {
    setSosContacts((previousContacts) =>
      previousContacts.map((contact) =>
        contact.id === id
          ? {
              ...contact,
              [field]: value,
            }
          : contact
      )
    );

    setSosSaved(false);
  };

  // ==============================
  // SAVE SOS CONTACTS
  // ==============================

  const saveSOSContacts = () => {
    const incompleteContact = sosContacts.some(
      (contact) =>
        contact.name.trim() === "" ||
        contact.phone.trim() === ""
    );

    if (incompleteContact) {
      alert(
        "Please enter both the name and phone number for every contact."
      );

      return;
    }

    const contactsToSave = sosContacts.map((contact) => ({
      name: contact.name.trim(),
      phone: contact.phone.trim(),
    }));

    localStorage.setItem(
      "safehelp_sos_contacts",
      JSON.stringify(contactsToSave)
    );

    setSosSaved(true);
    setShowSOS(false);
  };

  // ==============================
  // SOS EMERGENCY PRESS
  // ==============================

  const pressSOS = () => {
    if (sosContacts.length === 0) {
      alert("Please add SOS contacts first.");
      return;
    }

    const validContacts = sosContacts.filter(
      (contact) =>
        contact.name.trim() !== "" &&
        contact.phone.trim() !== ""
    );

    if (validContacts.length === 0) {
      alert("Please save at least one SOS contact first.");
      return;
    }

    setSosAlertSent(true);

    /*
      A normal browser cannot silently place multiple
      phone calls at once.

      For the web demo, we show that the emergency
      alert has been triggered and provide the saved
      contact numbers below.
    */

    alert(
      `🚨 SOS ALERT ACTIVATED!\n\nEmergency alert prepared for ${validContacts.length} saved contact(s).`
    );
  };

  // ==============================
  // LOAD SAVED INCIDENT REPORTS
  // (so they survive a page refresh and the Admin Portal
  // can see everything citizens have submitted)
  // ==============================

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        "safehelp_incident_reports"
      );

      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIncidentReports(JSON.parse(saved));
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  // ==============================
  // LOAD SAVED RESCUE TEAMS
  // ==============================

  useEffect(() => {
    try {
      const saved = localStorage.getItem("safehelp_rescue_teams");

      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRescueTeams(JSON.parse(saved));
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  // ==============================
  // LOAD SAVED VOLUNTEERS
  // ==============================

  useEffect(() => {
    try {
      const saved = localStorage.getItem("safehelp_volunteers");

      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVolunteers(JSON.parse(saved));
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  // ==============================
  // LOAD SAVED SOS CONTACTS
  // (this was previously only ever being saved, never
  // loaded back — contacts looked "lost" after a refresh)
  // ==============================

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        "safehelp_sos_contacts"
      );

      if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed) && parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSosContacts(
            parsed.map((contact, index) => ({
              id: Date.now() + index,
              name: contact.name || "",
              phone: contact.phone || "",
            }))
          );
          setSosSaved(true);
        }
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  // ==============================
  // SUBMIT INCIDENT REPORT
  // ==============================

  const submitIncidentReport = (type) => {
    let details = "";
    let photoName = null;

    if (type === "missing") {
      details =
        missingPersonDetailsRef.current?.value.trim() || "";
      photoName =
        missingPersonPhotoRef.current?.files?.[0]?.name || null;
    } else if (type === "property") {
      details = propertyAddressRef.current?.value.trim() || "";
    } else if (type === "description") {
      details =
        incidentDescriptionRef.current?.value.trim() || "";
    }

    if (!details) {
      alert(
        "Please fill in the required details before submitting."
      );
      return;
    }

    const typeLabels = {
      missing: "👤 Missing Person",
      property: "🏠 Lost House / Property",
      description: "📝 Incident Description",
    };

    const newReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      typeLabel: typeLabels[type],
      details,
      photoName,
      location: location || null,
      submittedAt: new Date().toISOString(),
    };

    setIncidentReports((previousReports) => {
      const updatedReports = [newReport, ...previousReports];

      localStorage.setItem(
        "safehelp_incident_reports",
        JSON.stringify(updatedReports)
      );

      return updatedReports;
    });

    // Clear the form that was just submitted
    if (type === "missing") {
      if (missingPersonDetailsRef.current) {
        missingPersonDetailsRef.current.value = "";
      }
      if (missingPersonPhotoRef.current) {
        missingPersonPhotoRef.current.value = "";
      }
    } else if (type === "property") {
      if (propertyAddressRef.current) {
        propertyAddressRef.current.value = "";
      }
    } else if (type === "description") {
      if (incidentDescriptionRef.current) {
        incidentDescriptionRef.current.value = "";
      }
    }

    setReportSubmittedType(type);
  };

  // ==============================
  // RESCUE TEAM MANAGEMENT
  // (manual roster — see note above; no live API exists for this)
  // ==============================

  const addRescueTeam = () => {
    const name = newTeamName.trim();

    if (!name) {
      alert("Please enter a team name first.");
      return;
    }

    const newTeam = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      status: "available",
    };

    setRescueTeams((previousTeams) => {
      const updatedTeams = [...previousTeams, newTeam];

      localStorage.setItem(
        "safehelp_rescue_teams",
        JSON.stringify(updatedTeams)
      );

      return updatedTeams;
    });

    setNewTeamName("");
  };

  const toggleTeamStatus = (id) => {
    setRescueTeams((previousTeams) => {
      const updatedTeams = previousTeams.map((team) =>
        team.id === id
          ? {
              ...team,
              status:
                team.status === "available"
                  ? "deployed"
                  : "available",
            }
          : team
      );

      localStorage.setItem(
        "safehelp_rescue_teams",
        JSON.stringify(updatedTeams)
      );

      return updatedTeams;
    });
  };

  const removeRescueTeam = (id) => {
    setRescueTeams((previousTeams) => {
      const updatedTeams = previousTeams.filter(
        (team) => team.id !== id
      );

      localStorage.setItem(
        "safehelp_rescue_teams",
        JSON.stringify(updatedTeams)
      );

      return updatedTeams;
    });
  };

  // ==============================
  // VOLUNTEERS DIRECTORY (Admin Portal)
  // ==============================

  const addVolunteer = () => {
    const name = newVolunteerName.trim();
    const phone = newVolunteerPhone.trim();
    const email = newVolunteerEmail.trim();

    if (!name || !phone || !email) {
      alert(
        "Please fill in name, phone number and email before adding a volunteer."
      );
      return;
    }

    const newVolunteer = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      phone,
      email,
    };

    setVolunteers((previousVolunteers) => {
      const updatedVolunteers = [
        ...previousVolunteers,
        newVolunteer,
      ];

      localStorage.setItem(
        "safehelp_volunteers",
        JSON.stringify(updatedVolunteers)
      );

      return updatedVolunteers;
    });

    setNewVolunteerName("");
    setNewVolunteerPhone("");
    setNewVolunteerEmail("");
  };

  const removeVolunteer = (id) => {
    setVolunteers((previousVolunteers) => {
      const updatedVolunteers = previousVolunteers.filter(
        (volunteer) => volunteer.id !== id
      );

      localStorage.setItem(
        "safehelp_volunteers",
        JSON.stringify(updatedVolunteers)
      );

      return updatedVolunteers;
    });
  };

  // ==============================
  // LIVE DATA LOADERS
  // (hospitals / shelters / weather — all keyed off `coords`)
  // ==============================

  const coordsKey = coords
    ? `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`
    : null;

  const loadHospitals = useCallback(async () => {
    if (!coords) return;

    setHospitalsLoading(true);
    setHospitalsError("");

    try {
      const results = await fetchNearbyHospitals(
        coords.lat,
        coords.lon
      );

      setHospitals(results);
      setHospitalsLoadedFor(coordsKey);

      if (results.length === 0) {
        setHospitalsError(
          "No hospitals found nearby in the map data for this area. Try widening your search or check back later."
        );
      }
    } catch (error) {
      console.error(error);

      setHospitalsError(
        "❌ Could not load nearby hospitals right now. Please check your internet connection and try again."
      );
    } finally {
      setHospitalsLoading(false);
    }
  }, [coords, coordsKey]);

  const loadShelters = useCallback(async () => {
    if (!coords) return;

    setSheltersLoading(true);
    setSheltersError("");

    try {
      const results = await fetchNearbyShelters(
        coords.lat,
        coords.lon
      );

      setShelters(results);
      setSheltersLoadedFor(coordsKey);

      if (results.length === 0) {
        setSheltersError(
          "No shelters/safe buildings found nearby in the map data for this area. Try widening your search or check back later."
        );
      }
    } catch (error) {
      console.error(error);

      setSheltersError(
        "❌ Could not load nearby shelters right now. Please check your internet connection and try again."
      );
    } finally {
      setSheltersLoading(false);
    }
  }, [coords, coordsKey]);

  const loadWeather = useCallback(async () => {
    if (!coords) return;

    setWeatherLoading(true);
    setWeatherError("");

    try {
      const result = await fetchWeather(coords.lat, coords.lon);

      setWeatherData(result);
      setWeatherLoadedFor(coordsKey);
    } catch (error) {
      console.error(error);

      setWeatherError(
        "❌ Could not load live weather data right now. Please check your internet connection and try again."
      );
    } finally {
      setWeatherLoading(false);
    }
  }, [coords, coordsKey]);

  // Auto-fetch the right live data whenever the citizen opens a
  // section that needs it (and it hasn't been loaded for the
  // current coordinates yet).
  //
  // This is a standard "fetch on dependency change" data effect.
  // We intentionally disable `set-state-in-effect` per call below:
  // the loaders themselves manage loading/error/result state and
  // are the accepted exception to that rule for data fetching.

  useEffect(() => {
    if (!coords) return;

    if (
      citizenSection === "hospitals" &&
      hospitalsLoadedFor !== coordsKey &&
      !hospitalsLoading
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadHospitals();
    }

    if (
      (citizenSection === "shelters" ||
        citizenSection === "safe-map") &&
      sheltersLoadedFor !== coordsKey &&
      !sheltersLoading
    ) {
      loadShelters();
    }

    if (
      citizenSection === "weather" &&
      weatherLoadedFor !== coordsKey &&
      !weatherLoading
    ) {
      loadWeather();
    }

    // Responder Portal's Live Map, and Admin Portal's Live
    // Disaster Map, both need hospitals and shelters loaded too.
    if (
      (responderSection === "map" || adminView === "map") &&
      hospitalsLoadedFor !== coordsKey &&
      !hospitalsLoading
    ) {
      loadHospitals();
    }

    if (
      (responderSection === "map" || adminView === "map") &&
      sheltersLoadedFor !== coordsKey &&
      !sheltersLoading
    ) {
      loadShelters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citizenSection, responderSection, adminView, coords, coordsKey]);

  // ==============================
  // AI ASSISTANT — SEND MESSAGE
  // ==============================

  const sendAssistantMessage = (text) => {
    const trimmed = text.trim();

    if (!trimmed) return;

    const reply = getAssistantReply(trimmed);

    setAiMessages((previous) => {
      const nextId = previous.length;

      const userMessage = {
        id: `${nextId}-user`,
        from: "user",
        text: trimmed,
      };

      const assistantMessage = {
        id: `${nextId}-assistant`,
        from: "assistant",
        text: reply,
      };

      return [...previous, userMessage, assistantMessage];
    });

    setAiInput("");
  };

  // ==============================
  // OPEN CITIZEN PORTAL
  // ==============================

  const openCitizenPortal = () => {
    setPortal("citizen");
    setCitizenSection(null);
  };

  // ==============================
  // OPEN RESPONDER PORTAL
  // ==============================

  const openResponderPortal = () => {
    setPortal("responder");
  };

  // ==============================
  // OPEN ADMIN PORTAL
  // ==============================

  const openAdminPortal = () => {
    setPortal("admin");
  };

  // ==============================
  // BACK TO SETUP
  // ==============================

  const backToSetup = () => {
    setPortal("setup");
    setCitizenSection(null);
    setResponderSection(null);
  };

  // ==============================
  // RENDER CITIZEN PORTAL
  // ==============================

  const renderCitizenPortal = () => {
    // ------------------------------
    // SAFE MAP
    // ------------------------------

    if (citizenSection === "safe-map") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>🗺️ Safe Map</h2>

          <p className="section-description">
            Find nearby safe places and evacuation locations
            during a disaster.
          </p>

          {coords ? (
            <>
              <LiveMap
                coords={coords}
                places={shelters}
                placeType="shelter"
                height={340}
              />

              {location && (
                <div className="current-location-small">
                  📍 Current Location: <strong>{location}</strong>
                </div>
              )}

              {sheltersLoading && (
                <p className="data-source-note">
                  Loading nearby safe places on the map...
                </p>
              )}
            </>
          ) : (
            <div className="map-placeholder">
              <div className="map-icon">🗺️</div>

              <h3>Live Safety Map</h3>

              <p>
                Set your location first (from the safety setup
                screen) to see the live map here.
              </p>
            </div>
          )}

          <div className="info-grid">

            <div className="info-card safe-card">
              <span>🟢</span>
              <h3>Safe Areas</h3>
              <p>Areas currently suitable for evacuation.</p>
            </div>

            <div className="info-card warning-card">
              <span>🟡</span>
              <h3>High Alert Areas</h3>
              <p>Areas requiring extra caution.</p>
            </div>

            <div className="info-card danger-card">
              <span>🔴</span>
              <h3>Affected Areas</h3>
              <p>Areas currently affected by disasters.</p>
            </div>

          </div>

          <h3 className="sub-heading">
            🏫 Nearby Safe Places
          </h3>

          <LiveDataStatus
            coords={coords}
            loading={sheltersLoading}
            error={sheltersError}
            onRetry={loadShelters}
            loadingText="Finding nearby safe buildings..."
          />

          {coords &&
            !sheltersLoading &&
            shelters.map((place) => (
              <PlaceResultCard
                key={place.id}
                place={place}
                icon="🏫"
              />
            ))}

          {coords && !sheltersLoading && shelters.length > 0 && (
            <p className="data-source-note">
              Live data from OpenStreetMap · schools & community
              centres are shown as likely evacuation points.
            </p>
          )}

        </div>
      );
    }

    // ------------------------------
    // EMERGENCY
    // ------------------------------

    if (citizenSection === "emergency") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>🚨 Emergency</h2>

          <p className="section-description">
            Get immediate access to emergency services.
          </p>

          <div className="emergency-grid">

            <div className="emergency-card">
              <div className="big-icon">🏥</div>
              <h3>Medical Help</h3>

              <p>
                Find nearby hospitals and doctors.
              </p>

              <button
                className="primary-small-button"
                onClick={() => setCitizenSection("hospitals")}
              >
                Find Hospitals
              </button>
            </div>

            <div className="emergency-card">
              <div className="big-icon">🏫</div>
              <h3>Evacuation</h3>

              <p>
                Find nearby shelters and safe buildings.
              </p>

              <button
                className="primary-small-button"
                onClick={() => setCitizenSection("shelters")}
              >
                Find Shelters
              </button>
            </div>

            <div className="emergency-card">
              <div className="big-icon">🚑</div>
              <h3>Ambulance Services</h3>

              <p>
                Contact nearby ambulance services.
              </p>

              <a
                href="tel:108"
                className="ambulance-number ambulance-number-link"
              >
                🚑 Emergency Ambulance: 108
              </a>

              <a
                href="tel:102"
                className="ambulance-number ambulance-number-link"
              >
                🚑 Local Ambulance: 102
              </a>

              <a href="tel:108" className="call-button">
                📞 Call Ambulance (108)
              </a>
            </div>

            <div className="emergency-card sos-emergency-card">
              <div className="big-icon">📞</div>

              <h3>SOS Emergency</h3>

              <p>
                Alert your saved emergency contacts.
              </p>

              <button
                className="sos-press-button"
                onClick={pressSOS}
              >
                🚨 PRESS SOS
              </button>

              {sosAlertSent && (
                <div className="sos-alert-success">
                  ✅ SOS emergency alert activated.
                </div>
              )}

              {sosContacts
                .filter(
                  (contact) =>
                    contact.name.trim() !== "" &&
                    contact.phone.trim() !== ""
                )
                .map((contact, index) => (
                  <div
                    className="saved-sos-contact"
                    key={index}
                  >
                    📞 {contact.name} — {contact.phone}
                  </div>
                ))}
            </div>

          </div>

        </div>
      );
    }

    // ------------------------------
    // NEARBY HOSPITALS (live data)
    // ------------------------------

    if (citizenSection === "hospitals") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection("emergency")}
          >
            ← Back to Emergency
          </button>

          <h2>🏥 Nearby Hospitals</h2>

          <p className="section-description">
            Real hospitals, clinics and doctors near your
            location, pulled live from OpenStreetMap.
          </p>

          <LiveDataStatus
            coords={coords}
            loading={hospitalsLoading}
            error={hospitalsError}
            onRetry={loadHospitals}
            loadingText="Finding nearby hospitals..."
          />

          {coords && !hospitalsLoading && hospitals.length > 0 && (
            <LiveMap
              coords={coords}
              places={hospitals}
              placeType="hospital"
            />
          )}

          {coords &&
            !hospitalsLoading &&
            hospitals.map((place) => (
              <PlaceResultCard
                key={place.id}
                place={place}
                icon="🏥"
              />
            ))}

          {coords && !hospitalsLoading && hospitals.length > 0 && (
            <p className="data-source-note">
              Live data from OpenStreetMap contributors — always
              call ahead to confirm availability in an emergency.
            </p>
          )}

        </div>
      );
    }

    // ------------------------------
    // NEARBY SHELTERS (live data)
    // ------------------------------

    if (citizenSection === "shelters") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection("emergency")}
          >
            ← Back to Emergency
          </button>

          <h2>🏫 Nearby Shelters</h2>

          <p className="section-description">
            Real schools, community centres and marked emergency
            shelters near your location, pulled live from
            OpenStreetMap.
          </p>

          <LiveDataStatus
            coords={coords}
            loading={sheltersLoading}
            error={sheltersError}
            onRetry={loadShelters}
            loadingText="Finding nearby shelters..."
          />

          {coords && !sheltersLoading && shelters.length > 0 && (
            <LiveMap
              coords={coords}
              places={shelters}
              placeType="shelter"
            />
          )}

          {coords &&
            !sheltersLoading &&
            shelters.map((place) => (
              <PlaceResultCard
                key={place.id}
                place={place}
                icon="🏫"
              />
            ))}

          {coords && !sheltersLoading && shelters.length > 0 && (
            <p className="data-source-note">
              Live data from OpenStreetMap · always confirm
              current capacity with local authorities.
            </p>
          )}

        </div>
      );
    }

    // ------------------------------
    // INCIDENT REPORTING
    // ------------------------------

    if (citizenSection === "incident") {

      if (incidentType) {
        return (
          <div className="portal-content">

            <button
              className="back-button"
              onClick={() => {
                setIncidentType(null);
                setReportSubmittedType(null);
              }}
            >
              ← Back to Incident Reporting
            </button>

            {incidentType === "missing" && (
              <>
                <h2>👤 Missing Person</h2>

                <p className="section-description">
                  Report a missing person and provide
                  important details.
                </p>

                <div className="form-card">

                  <label>Upload Photo</label>

                  <input
                    type="file"
                    accept="image/*"
                    ref={missingPersonPhotoRef}
                  />

                  <label>Person Details</label>

                  <textarea
                    placeholder="Enter name, age, clothing, last seen location and other details..."
                    rows="6"
                    ref={missingPersonDetailsRef}
                  />

                  <button
                    className="primary-small-button"
                    onClick={() => submitIncidentReport("missing")}
                  >
                    Submit Report
                  </button>

                  {reportSubmittedType === "missing" && (
                    <p className="success-message">
                      ✅ Report submitted successfully! It's
                      now visible to responders in the Admin
                      Portal.
                    </p>
                  )}

                </div>
              </>
            )}

            {incidentType === "property" && (
              <>
                <h2>🏠 Lost House / Property</h2>

                <p className="section-description">
                  Report a damaged or lost house/property.
                </p>

                <div className="form-card">

                  <label>House / Property Address</label>

                  <textarea
                    placeholder="Enter the house or property address..."
                    rows="5"
                    ref={propertyAddressRef}
                  />

                  <button
                    className="primary-small-button"
                    onClick={() => submitIncidentReport("property")}
                  >
                    Submit Report
                  </button>

                  {reportSubmittedType === "property" && (
                    <p className="success-message">
                      ✅ Report submitted successfully! It's
                      now visible to responders in the Admin
                      Portal.
                    </p>
                  )}

                </div>
              </>
            )}

            {incidentType === "description" && (
              <>
                <h2>📝 Incident Description</h2>

                <p className="section-description">
                  Describe the emergency or incident you
                  are experiencing.
                </p>

                <div className="form-card">

                  <label>Write a Description</label>

                  <textarea
                    placeholder="Describe what happened..."
                    rows="8"
                    ref={incidentDescriptionRef}
                  />

                  <button
                    className="primary-small-button"
                    onClick={() =>
                      submitIncidentReport("description")
                    }
                  >
                    Submit Report
                  </button>

                  {reportSubmittedType === "description" && (
                    <p className="success-message">
                      ✅ Report submitted successfully! It's
                      now visible to responders in the Admin
                      Portal.
                    </p>
                  )}

                </div>
              </>
            )}

          </div>
        );
      }

      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>📋 Incident Reporting</h2>

          <p className="section-description">
            Report an incident so responders can understand
            and respond to the situation.
          </p>

          <div className="incident-options">

            <button
              className="portal-option-card"
              onClick={() => setIncidentType("missing")}
            >
              <span className="option-icon">👤</span>

              <div>
                <h3>Missing Person</h3>

                <p>
                  Upload photo and provide person details.
                </p>
              </div>

              <span className="arrow">→</span>
            </button>

            <button
              className="portal-option-card"
              onClick={() => setIncidentType("property")}
            >
              <span className="option-icon">🏠</span>

              <div>
                <h3>Lost House / Property</h3>

                <p>
                  Provide the house or property address.
                </p>
              </div>

              <span className="arrow">→</span>
            </button>

            <button
              className="portal-option-card"
              onClick={() => setIncidentType("description")}
            >
              <span className="option-icon">📝</span>

              <div>
                <h3>Incident Description</h3>

                <p>
                  Write a description of the incident.
                </p>
              </div>

              <span className="arrow">→</span>
            </button>

          </div>

        </div>
      );
    }

    // ------------------------------
    // WEATHER
    // ------------------------------

    if (citizenSection === "weather") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>🌦️ Weather</h2>

          <p className="section-description">
            Live weather conditions and disaster-related
            alerts for your location.
          </p>

          <LiveDataStatus
            coords={coords}
            loading={weatherLoading}
            error={weatherError}
            onRetry={loadWeather}
            loadingText="Fetching live weather data..."
          />

          {coords && !weatherLoading && weatherData && (
            <>
              <div className="weather-card">

                <div className="weather-icon">
                  {weatherData.current.icon}
                </div>

                <h3>Current Weather</h3>

                <p className="weather-status">
                  {weatherData.current.text} ·{" "}
                  {Math.round(weatherData.current.temperature)}°C
                </p>

                <p className="weather-status">
                  💧 Humidity: {weatherData.current.humidity}% ·
                  💨 Wind: {Math.round(weatherData.current.windSpeed)}{" "}
                  km/h
                </p>

                {location && <p>📍 {location}</p>}

              </div>

              <div
                className={
                  weatherData.rainfall.heavyRainfallAlert
                    ? "weather-alert alert-active"
                    : "weather-alert alert-clear"
                }
              >
                <h3>⚠️ Heavy Rainfall Alert</h3>

                {weatherData.rainfall.heavyRainfallAlert ? (
                  <p>
                    Heavy rainfall is likely in the next 12
                    hours ({weatherData.rainfall.maxProbabilityNext12h}%
                    chance, ~
                    {weatherData.rainfall.next12hRainSum}mm
                    expected). Possible flooding risk in
                    low-lying areas — stay alert.
                  </p>
                ) : weatherData.rainfall.moderateRainWatch ? (
                  <p>
                    Moderate rain is possible today (~
                    {weatherData.rainfall.todayMaxProbability}%
                    chance, ~{weatherData.rainfall.todayPrecipSum}mm
                    expected). No severe flooding risk right now.
                  </p>
                ) : (
                  <p>
                    No heavy rainfall expected in your area right
                    now. We'll flag it here as soon as conditions
                    change.
                  </p>
                )}
              </div>

              <div
                className={
                  weatherData.generalAlerts.length > 0
                    ? "weather-alert alert-active"
                    : "weather-alert alert-clear"
                }
              >
                <h3>🌧️ Weather Alerts</h3>

                {weatherData.generalAlerts.length > 0 ? (
                  weatherData.generalAlerts.map((alert) => (
                    <p key={alert.title}>
                      <strong>{alert.title}:</strong>{" "}
                      {alert.message}
                    </p>
                  ))
                ) : (
                  <p>
                    No severe weather warnings (storms, extreme
                    wind or heat) for your area right now.
                  </p>
                )}
              </div>

              <div className="weather-alert">
                <h3>🛡️ Safety Tips</h3>

                {weatherData.safetyTips.map((tip) => (
                  <p key={tip}>• {tip}</p>
                ))}
              </div>

              <p className="data-source-note">
                Live data from Open-Meteo · updated{" "}
                {new Date(weatherData.fetchedAt).toLocaleTimeString()}
              </p>
            </>
          )}

        </div>
      );
    }

    // ------------------------------
    // SOS CONTACTS (standalone screen)
    // ------------------------------

    if (citizenSection === "sos") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>📞 SOS Contacts</h2>

          <p className="section-description">
            Manage the people who get alerted when you press
            SOS, and keep official emergency numbers handy.
          </p>

          <div className="sos-section">

            {sosContacts.map((contact, index) => (
              <div className="contact-card" key={contact.id}>

                <div className="contact-header">
                  <h4>Emergency Contact {index + 1}</h4>

                  {sosContacts.length > 1 && (
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => removeContact(contact.id)}
                    >
                      🗑️ Remove
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Contact name"
                  value={contact.name}
                  onChange={(event) =>
                    updateContact(
                      contact.id,
                      "name",
                      event.target.value
                    )
                  }
                />

                <input
                  type="tel"
                  placeholder="Phone number"
                  value={contact.phone}
                  onChange={(event) =>
                    updateContact(
                      contact.id,
                      "phone",
                      event.target.value
                    )
                  }
                />

              </div>
            ))}

            <button
              type="button"
              className="add-contact-button"
              onClick={addContact}
            >
              ＋ Add Another Contact
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={saveSOSContacts}
            >
              💾 Save SOS Contacts
            </button>

            {sosSaved && (
              <p className="success-message">
                ✅ SOS contacts saved successfully!
              </p>
            )}

          </div>

          <h3 className="sub-heading">
            ☎️ Official Emergency Helplines (India)
          </h3>

          <div className="helpline-grid">
            {NATIONAL_HELPLINES.map((helpline) => (
              <a
                key={helpline.number}
                href={`tel:${helpline.number}`}
                className="helpline-card"
              >
                <span className="helpline-number">
                  {helpline.number}
                </span>
                <span className="helpline-label">
                  {helpline.label}
                </span>
              </a>
            ))}
          </div>

          <p className="data-source-note">
            Source: Government of India — Incredible India
            official emergency numbers page. Numbers can vary
            slightly by state; confirm locally if unsure.
          </p>

        </div>
      );
    }

    // ------------------------------
    // AI ASSISTANT (rule-based, offline safety guide)
    // ------------------------------

    if (citizenSection === "ai") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>🤖 AI Safety Assistant</h2>

          <p className="section-description">
            A built-in safety guide — works instantly, no
            internet-dependent AI service required.
          </p>

          <div className="chat-window">
            {aiMessages.map((message) => (
              <div
                key={message.id}
                className={
                  message.from === "user"
                    ? "chat-bubble chat-bubble-user"
                    : "chat-bubble chat-bubble-assistant"
                }
              >
                {message.text}
              </div>
            ))}
          </div>

          <div className="chat-suggestions">
            {ASSISTANT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="chat-suggestion-chip"
                onClick={() => sendAssistantMessage(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              placeholder="Ask a safety question..."
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendAssistantMessage(aiInput);
                }
              }}
            />

            <button
              className="primary-small-button"
              onClick={() => sendAssistantMessage(aiInput)}
            >
              Send
            </button>
          </div>

        </div>
      );
    }

    // ------------------------------
    // PROFILE & SETTINGS
    // ------------------------------

    if (citizenSection === "settings") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setCitizenSection(null)}
          >
            ← Back to Citizen Portal
          </button>

          <h2>👤 Profile & Settings</h2>

          <p className="section-description">
            Manage your saved location, SOS contacts, and app
            data.
          </p>

          <div className="settings-card">
            <h3>📍 Location</h3>

            <p>
              {location
                ? `Currently set to: ${location}`
                : "No location set yet."}
            </p>

            <button
              className="setup-button"
              onClick={() => {
                setPortal("setup");
                setStarted(true);
              }}
            >
              Update Location
            </button>
          </div>

          <div className="settings-card">
            <h3>📞 SOS Contacts</h3>

            <p>
              {sosContacts.filter(
                (contact) =>
                  contact.name.trim() && contact.phone.trim()
              ).length}{" "}
              contact(s) saved.
            </p>

            <button
              className="setup-button"
              onClick={() => setCitizenSection("sos")}
            >
              Manage SOS Contacts
            </button>
          </div>

          <div className="settings-card">
            <h3>📋 Your Incident Reports</h3>

            <p>{incidentReports.length} report(s) submitted.</p>
          </div>

          <div className="settings-card">
            <h3>🗑️ App Data</h3>

            <p>
              Your SOS contacts and reports are stored only in
              this browser (not on a server yet).
            </p>

            <button
              className="setup-button danger-setup-button"
              onClick={() => {
                const confirmed = window.confirm(
                  "This will permanently delete your saved SOS contacts and incident reports from this browser. Continue?"
                );

                if (!confirmed) return;

                localStorage.removeItem("safehelp_sos_contacts");
                localStorage.removeItem(
                  "safehelp_incident_reports"
                );

                setSosContacts([
                  { id: Date.now(), name: "", phone: "" },
                ]);
                setSosSaved(false);
                setIncidentReports([]);

                alert("✅ Saved app data cleared.");
              }}
            >
              Clear All Saved Data
            </button>
          </div>

          <p className="data-source-note">SafeHelp · v1.0</p>

        </div>
      );
    }

    // ------------------------------
    // MAIN CITIZEN PORTAL
    // ------------------------------

    return (
      <div className="portal-content">

        <button
          className="back-button"
          onClick={backToSetup}
        >
          ← Back
        </button>

        <h1 className="portal-title">
          Citizen Portal
        </h1>

        <p className="portal-subtitle">
          I Need Help
        </p>

        <div className="citizen-grid">

          <button
            className="citizen-card safe-map-card"
            onClick={() =>
              setCitizenSection("safe-map")
            }
          >
            <span className="citizen-icon">
              🗺️
            </span>

            <h3>Safe Map</h3>

            <p>
              Find safe places and evacuation areas
            </p>

            <span className="card-arrow">
              →
            </span>
          </button>

          <button
            className="citizen-card emergency-card-main"
            onClick={() =>
              setCitizenSection("emergency")
            }
          >
            <span className="citizen-icon">
              🚨
            </span>

            <h3>Emergency</h3>

            <p>
              Medical help, evacuation, ambulance and SOS
            </p>

            <span className="card-arrow">
              →
            </span>
          </button>

          <button
            className="citizen-card incident-card-main"
            onClick={() =>
              setCitizenSection("incident")
            }
          >
            <span className="citizen-icon">
              📋
            </span>

            <h3>Incident Reporting</h3>

            <p>
              Report missing persons, property and incidents
            </p>

            <span className="card-arrow">
              →
            </span>
          </button>

          <button
            className="citizen-card weather-card-main"
            onClick={() =>
              setCitizenSection("weather")
            }
          >
            <span className="citizen-icon">
              🌦️
            </span>

            <h3>Weather</h3>

            <p>
              Weather conditions and disaster alerts
            </p>

            <span className="card-arrow">
              →
            </span>
          </button>

        </div>

        <h3 className="quick-access-title">
          Other Options
        </h3>

        <div className="quick-access-grid">

          <button
            className="quick-card"
            onClick={() => setCitizenSection("hospitals")}
          >
            🏥
            <span>Nearby Hospitals</span>
          </button>

          <button
            className="quick-card"
            onClick={() => setCitizenSection("shelters")}
          >
            🏫
            <span>Nearby Shelters</span>
          </button>

          <button
            className="quick-card"
            onClick={() => setCitizenSection("sos")}
          >
            📞
            <span>SOS Contacts</span>
          </button>

          <button
            className="quick-card"
            onClick={() => setCitizenSection("ai")}
          >
            🤖
            <span>AI Assistant</span>
          </button>

          <button
            className="quick-card"
            onClick={() => setCitizenSection("settings")}
          >
            👤
            <span>Profile & Settings</span>
          </button>

        </div>

      </div>
    );
  };

  // ==============================
  // RESPONDER PORTAL
  // ==============================

  const renderResponderPortal = () => {
    // ------------------------------
    // EMERGENCY REQUESTS
    // (the same incident reports citizens submit — responders
    // need to see and act on these)
    // ------------------------------

    if (responderSection === "requests") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setResponderSection(null)}
          >
            ← Back to Responder Portal
          </button>

          <h2>🚨 Emergency Requests</h2>

          <p className="section-description">
            Incident reports submitted by citizens through the
            app, newest first.
          </p>

          {incidentReports.length === 0 && (
            <div className="location-missing-box">
              <p>No emergency requests yet.</p>
              <p className="small-note">
                Reports submitted from the Citizen Portal's
                "Incident Reporting" section will show up here
                for responders to act on.
              </p>
            </div>
          )}

          {incidentReports.map((report) => (
            <div className="place-card" key={report.id}>
              <h3>{report.typeLabel}</h3>

              <p>📝 {report.details}</p>

              {report.photoName && (
                <p>📷 Attached photo: {report.photoName}</p>
              )}

              {report.location && <p>📍 {report.location}</p>}

              <p>
                🕒{" "}
                {new Date(report.submittedAt).toLocaleString()}
              </p>
            </div>
          ))}

        </div>
      );
    }

    // ------------------------------
    // RESCUE TEAMS
    // (manual roster — no public API reports real-world
    // rescue-team availability, so this is tracked here instead)
    // ------------------------------

    if (responderSection === "teams") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setResponderSection(null)}
          >
            ← Back to Responder Portal
          </button>

          <h2>🚑 Rescue Teams</h2>

          <p className="section-description">
            Track which rescue teams are available, and mark a
            team as deployed once it's assigned to an incident.
          </p>

          <p className="data-source-note">
            There's no public API that reports live rescue-team
            availability — that's internal, organisation-specific
            data. So teams are added and tracked manually here,
            saved in this browser.
          </p>

          {rescueTeams.length === 0 && (
            <div className="location-missing-box">
              <p>No rescue teams added yet.</p>
              <p className="small-note">
                Add your first team below.
              </p>
            </div>
          )}

          {rescueTeams.map((team) => (
            <div className="contact-card" key={team.id}>

              <div className="contact-header">
                <h4>
                  {team.status === "available" ? "🟢" : "🔴"}{" "}
                  {team.name}
                </h4>

                <button
                  type="button"
                  className="remove-button"
                  onClick={() => removeRescueTeam(team.id)}
                >
                  🗑️ Remove
                </button>
              </div>

              <p className="location-name">
                {team.status === "available"
                  ? "Available"
                  : "Deployed"}
              </p>

              <button
                type="button"
                className="direction-button"
                onClick={() => toggleTeamStatus(team.id)}
              >
                {team.status === "available"
                  ? "Mark as Deployed"
                  : "Mark as Available"}
              </button>

            </div>
          ))}

          <input
            type="text"
            className="location-search-input"
            placeholder="Team name (e.g. Rescue Unit 1)"
            value={newTeamName}
            onChange={(event) =>
              setNewTeamName(event.target.value)
            }
          />

          <button
            type="button"
            className="add-contact-button"
            onClick={addRescueTeam}
          >
            ＋ Add Rescue Team
          </button>

        </div>
      );
    }

    // ------------------------------
    // LIVE MAP
    // (real hospitals + shelters near the responder's location,
    // same live OpenStreetMap data used on the Citizen Portal)
    // ------------------------------

    if (responderSection === "map") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setResponderSection(null)}
          >
            ← Back to Responder Portal
          </button>

          <h2>🗺️ Live Disaster Map</h2>

          <p className="section-description">
            Live hospitals and shelters near your set location,
            pulled from OpenStreetMap.
          </p>

          <p className="small-note">
            Incident locations here are the free-text address a
            citizen typed in, not GPS coordinates, so individual
            incident pins can't be plotted on the map yet — see
            the Emergency Requests list for exact incident
            locations.
          </p>

          <h3 className="sub-heading">🏥 Hospitals</h3>

          <LiveDataStatus
            coords={coords}
            loading={hospitalsLoading}
            error={hospitalsError}
            onRetry={loadHospitals}
            loadingText="Finding nearby hospitals..."
          />

          {coords && !hospitalsLoading && hospitals.length > 0 && (
            <LiveMap
              coords={coords}
              places={hospitals}
              placeType="hospital"
              height={280}
            />
          )}

          <h3 className="sub-heading">🏫 Shelters</h3>

          <LiveDataStatus
            coords={coords}
            loading={sheltersLoading}
            error={sheltersError}
            onRetry={loadShelters}
            loadingText="Finding nearby shelters..."
          />

          {coords && !sheltersLoading && shelters.length > 0 && (
            <LiveMap
              coords={coords}
              places={shelters}
              placeType="shelter"
              height={280}
            />
          )}

        </div>
      );
    }

    // ------------------------------
    // NOTIFICATIONS
    // (a live activity feed built from real citizen-submitted
    // incident reports — there's no push-notification backend,
    // so this is an in-app feed rather than a device push alert)
    // ------------------------------

    if (responderSection === "notifications") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setResponderSection(null)}
          >
            ← Back to Responder Portal
          </button>

          <h2>📢 Notifications</h2>

          <p className="section-description">
            A live feed of activity from the Citizen Portal.
          </p>

          {incidentReports.length === 0 && (
            <div className="location-missing-box">
              <p>No notifications yet.</p>
              <p className="small-note">
                New incident reports from citizens will appear
                here as they come in.
              </p>
            </div>
          )}

          {incidentReports.map((report) => (
            <div className="place-card" key={report.id}>
              <h3>🔔 New {report.typeLabel}</h3>

              <p>{report.details}</p>

              <p>
                🕒{" "}
                {new Date(report.submittedAt).toLocaleString()}
              </p>
            </div>
          ))}

        </div>
      );
    }

    // ------------------------------
    // MAIN RESPONDER GRID
    // ------------------------------

    return (
      <div className="portal-content">

        <button
          className="back-button"
          onClick={backToSetup}
        >
          ← Back
        </button>

        <h1 className="portal-title">
          🛡️ Responder Portal
        </h1>

        <p className="portal-subtitle">
          Emergency Response Center
        </p>

        <div className="responder-grid">

          <button
            className="responder-card"
            onClick={() => setResponderSection("requests")}
          >
            <span>🚨</span>
            <h3>Emergency Requests</h3>
            <p>
              View incoming citizen emergency requests.
            </p>
          </button>

          <button
            className="responder-card"
            onClick={() => setResponderSection("teams")}
          >
            <span>🚑</span>
            <h3>Rescue Teams</h3>
            <p>
              Track and assign available rescue teams.
            </p>
          </button>

          <button
            className="responder-card"
            onClick={() => setResponderSection("map")}
          >
            <span>🗺️</span>
            <h3>Live Map</h3>
            <p>
              View incidents, affected areas and teams.
            </p>
          </button>

          <button
            className="responder-card"
            onClick={() => setResponderSection("notifications")}
          >
            <span>📢</span>
            <h3>Notifications</h3>
            <p>
              Receive real-time emergency alerts.
            </p>
          </button>

        </div>

      </div>
    );
  };

  // ==============================
  // ADMIN PORTAL
  // ==============================

  const renderAdminPortal = () => {
    if (adminView === "incidents") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setAdminView(null)}
          >
            ← Back to Admin Portal
          </button>

          <h2>📋 Incident Reports</h2>

          <p className="section-description">
            Reports submitted by citizens through the app.
          </p>

          {incidentReports.length === 0 && (
            <div className="location-missing-box">
              <p>No incident reports submitted yet.</p>
              <p className="small-note">
                Reports submitted from the Citizen Portal's
                "Incident Reporting" section will show up here.
              </p>
            </div>
          )}

          {incidentReports.map((report) => (
            <div className="place-card" key={report.id}>
              <h3>{report.typeLabel}</h3>

              <p>📝 {report.details}</p>

              {report.photoName && (
                <p>📷 Attached photo: {report.photoName}</p>
              )}

              {report.location && <p>📍 {report.location}</p>}

              <p>
                🕒{" "}
                {new Date(report.submittedAt).toLocaleString()}
              </p>
            </div>
          ))}

        </div>
      );
    }

    if (adminView === "map") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setAdminView(null)}
          >
            ← Back to Admin Portal
          </button>

          <h2>🗺️ Live Disaster Map</h2>

          <p className="section-description">
            Live hospitals and shelters near your set location,
            pulled from OpenStreetMap, plus a snapshot of current
            incident activity.
          </p>

          <div className="info-grid">

            <div className="info-card safe-card">
              <span>🏫</span>
              <h3>{shelters.length}</h3>
              <p>Shelters found nearby.</p>
            </div>

            <div className="info-card warning-card">
              <span>🚨</span>
              <h3>{incidentReports.length}</h3>
              <p>Incidents reported by citizens.</p>
            </div>

            <div className="info-card danger-card">
              <span>🏥</span>
              <h3>{hospitals.length}</h3>
              <p>Hospitals found nearby.</p>
            </div>

          </div>

          <p className="small-note">
            Incident locations here are the free-text address a
            citizen typed in, not GPS coordinates, so individual
            incident pins can't be plotted on the map yet — see
            Incident Management for exact incident locations.
          </p>

          <h3 className="sub-heading">🏥 Hospitals</h3>

          <LiveDataStatus
            coords={coords}
            loading={hospitalsLoading}
            error={hospitalsError}
            onRetry={loadHospitals}
            loadingText="Finding nearby hospitals..."
          />

          {coords && !hospitalsLoading && hospitals.length > 0 && (
            <LiveMap
              coords={coords}
              places={hospitals}
              placeType="hospital"
              height={280}
            />
          )}

          <h3 className="sub-heading">🏫 Shelters</h3>

          <LiveDataStatus
            coords={coords}
            loading={sheltersLoading}
            error={sheltersError}
            onRetry={loadShelters}
            loadingText="Finding nearby shelters..."
          />

          {coords && !sheltersLoading && shelters.length > 0 && (
            <LiveMap
              coords={coords}
              places={shelters}
              placeType="shelter"
              height={280}
            />
          )}

        </div>
      );
    }

    if (adminView === "volunteers") {
      return (
        <div className="portal-content">

          <button
            className="back-button"
            onClick={() => setAdminView(null)}
          >
            ← Back to Admin Portal
          </button>

          <h2>🙋 Volunteering People</h2>

          <p className="section-description">
            A directory of volunteers so you can reach them
            quickly if something urgent happens.
          </p>

          {volunteers.length === 0 && (
            <div className="location-missing-box">
              <p>No volunteers added yet.</p>
              <p className="small-note">
                Add your first volunteer below.
              </p>
            </div>
          )}

          {volunteers.map((volunteer) => (
            <div className="contact-card" key={volunteer.id}>

              <div className="contact-header">
                <h4>🙋 {volunteer.name}</h4>

                <button
                  type="button"
                  className="remove-button"
                  onClick={() => removeVolunteer(volunteer.id)}
                >
                  🗑️ Remove
                </button>
              </div>

              <div className="place-card-actions">
                <a
                  className="direction-button call-link"
                  href={`tel:${volunteer.phone}`}
                >
                  📞 {volunteer.phone}
                </a>

                <a
                  className="direction-button call-link"
                  href={`mailto:${volunteer.email}`}
                >
                  ✉️ Email
                </a>
              </div>

            </div>
          ))}

          <input
            type="text"
            className="location-search-input"
            placeholder="Volunteer name"
            value={newVolunteerName}
            onChange={(event) =>
              setNewVolunteerName(event.target.value)
            }
          />

          <input
            type="tel"
            className="location-search-input"
            placeholder="Phone number"
            value={newVolunteerPhone}
            onChange={(event) =>
              setNewVolunteerPhone(event.target.value)
            }
          />

          <input
            type="email"
            className="location-search-input"
            placeholder="Email address"
            value={newVolunteerEmail}
            onChange={(event) =>
              setNewVolunteerEmail(event.target.value)
            }
          />

          <button
            type="button"
            className="add-contact-button"
            onClick={addVolunteer}
          >
            ＋ Add Volunteer
          </button>

        </div>
      );
    }

    return (
      <div className="portal-content">

        <button
          className="back-button"
          onClick={backToSetup}
        >
          ← Back
        </button>

        <h1 className="portal-title">
          🏢 Admin Portal
        </h1>

        <p className="portal-subtitle">
          Disaster Command Center
        </p>

        <div className="admin-stats">

          <div className="admin-stat">
            <span>👥</span>
            <strong>0</strong>
            <p>Affected People</p>
          </div>

          <div className="admin-stat">
            <span>🚨</span>
            <strong>{incidentReports.length}</strong>
            <p>Critical Incidents</p>
          </div>

          <div className="admin-stat">
            <span>🚑</span>
            <strong>0</strong>
            <p>Active Responders</p>
          </div>

          <div className="admin-stat">
            <span>🏫</span>
            <strong>0</strong>
            <p>Shelters Available</p>
          </div>

        </div>

        <div className="admin-feature-grid">

          <button
            className="admin-feature"
            onClick={() => setAdminView("map")}
          >
            🗺️
            <h3>Live Disaster Map</h3>
          </button>

          <button
            className="admin-feature"
            onClick={() => setAdminView("incidents")}
          >
            📋
            <h3>Incident Management</h3>
          </button>

          <div className="admin-feature">
            📦
            <h3>Resource Management</h3>
          </div>

          <div className="admin-feature">
            👥
            <h3>Team Management</h3>
          </div>

          <div className="admin-feature">
            🏫
            <h3>Shelter Management</h3>
          </div>

          <button
            className="admin-feature"
            onClick={() => setAdminView("volunteers")}
          >
            🙋
            <h3>Volunteering People</h3>
          </button>

          <div className="admin-feature">
            🔔
            <h3>Alerts Management</h3>
          </div>

          <div className="admin-feature">
            📊
            <h3>Analytics & Reports</h3>
          </div>

        </div>

      </div>
    );
  };

  // ==============================
  // MAIN UI
  // ==============================

  return (
    <div className="app">

      {/* BACKGROUND */}

      <img
        src={safehelpImage}
        alt="SafeHelp Disaster Management"
        className="full-screen-image"
      />

      <div className="welcome-card">

        {/* ==========================
            SETUP
        ========================== */}

        {portal === "setup" && !started && (
          <div className="setup-wrapper">

            <div
              className="content-overlay welcome-image-card"
              style={{
                backgroundImage: `linear-gradient(rgba(4, 15, 35, 0.35), rgba(4, 15, 35, 0.35)), url(${floodImage})`,
              }}
            >

              <h1>Welcome to ResQ</h1>

              <h2>
                Smart Disaster Response & Emergency Management
              </h2>

              <p className="welcome-tagline">
                Together, we respond. Together, we stay safe.
              </p>

              <p className="intro-text">
                Connecting people, responders, and authorities
                for faster, safer emergency response.
              </p>

              <button
                className="primary-button"
                onClick={() => setStarted(true)}
              >
                Get Started
              </button>

            </div>

          </div>
        )}

        {/* ==========================
            SAFETY SETUP
        ========================== */}

        {portal === "setup" && started && (
          <div className="setup-wrapper">

            <div className="content-overlay setup-container">

              <h1>Welcome to SafeHelp</h1>

              <h2>
                Let's set up your safety profile
              </h2>

              {/* LOCATION */}

              <button
                className="setup-button"
                onClick={getCurrentLocation}
                disabled={isDetectingLocation}
              >
                {isDetectingLocation
                  ? "📍 Detecting Location..."
                  : "📍 Use Current Location"}
              </button>

              {locationMessage && (
                <p className="location-message">
                  {locationMessage}
                </p>
              )}

              {location && (
                <div className="location-box">

                  <div className="location-title">
                    📍 Your Location
                  </div>

                  <div className="location-name">
                    {location}
                  </div>

                </div>
              )}

              {/* MANUAL LOCATION SEARCH */}

              <p className="or-divider">— or search for a place —</p>

              <div className="manual-location-search">
                <input
                  type="text"
                  className="location-search-input"
                  placeholder="Enter a city, area or address"
                  value={manualLocationQuery}
                  onChange={(event) =>
                    setManualLocationQuery(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      searchLocationByName();
                    }
                  }}
                />

                <button
                  className="setup-button"
                  onClick={searchLocationByName}
                  disabled={isSearchingLocation}
                >
                  {isSearchingLocation
                    ? "🔍 Searching..."
                    : "🔍 Search Location"}
                </button>
              </div>

              {locationSearchError && (
                <p className="location-message">
                  {locationSearchError}
                </p>
              )}

              {locationSearchResults.length > 0 && (
                <div className="location-results-list">
                  {locationSearchResults.map((result) => (
                    <button
                      key={result.place_id}
                      className="location-result-item"
                      onClick={() => selectSearchedLocation(result)}
                    >
                      📍 {result.display_name}
                    </button>
                  ))}
                </div>
              )}

              {/* SOS */}

              <button
                className="setup-button"
                onClick={() => {
                  setShowSOS(true);
                  setSosSaved(false);
                }}
              >
                📞 Set SOS Numbers
              </button>

              {sosSaved && (
                <p className="success-message">
                  ✅ SOS contacts saved successfully!
                </p>
              )}

              {/* SOS FORM */}

              {showSOS && (
                <div className="sos-section">

                  <h3>
                    📞 Emergency Contacts
                  </h3>

                  <p className="sos-description">
                    Add trusted people who can be
                    contacted during an emergency.
                  </p>

                  {sosContacts.map(
                    (contact, index) => (
                      <div
                        className="contact-card"
                        key={contact.id}
                      >

                        <div className="contact-header">

                          <h4>
                            Emergency Contact{" "}
                            {index + 1}
                          </h4>

                          {sosContacts.length > 1 && (
                            <button
                              type="button"
                              className="remove-button"
                              onClick={() =>
                                removeContact(
                                  contact.id
                                )
                              }
                            >
                              🗑️ Remove
                            </button>
                          )}

                        </div>

                        <input
                          type="text"
                          placeholder="Contact name"
                          value={contact.name}
                          onChange={(event) =>
                            updateContact(
                              contact.id,
                              "name",
                              event.target.value
                            )
                          }
                        />

                        <input
                          type="tel"
                          placeholder="Phone number"
                          value={contact.phone}
                          onChange={(event) =>
                            updateContact(
                              contact.id,
                              "phone",
                              event.target.value
                            )
                          }
                        />

                      </div>
                    )
                  )}

                  <button
                    type="button"
                    className="add-contact-button"
                    onClick={addContact}
                  >
                    ＋ Add Another Contact
                  </button>

                  <button
                    type="button"
                    className="primary-button"
                    onClick={saveSOSContacts}
                  >
                    💾 Save SOS Contacts
                  </button>

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() =>
                      setShowSOS(false)
                    }
                  >
                    Cancel
                  </button>

                </div>
              )}

              {!showSOS && (
                <button
                  className="primary-button"
                  onClick={openCitizenPortal}
                >
                  Continue to Citizen Portal →
                </button>
              )}

            </div>

            {/* ==========================
                RESPONDER + ADMIN PORTALS
            ========================== */}

            <div className="role-portals">

              <button
                className="role-portal responder-role"
                onClick={openResponderPortal}
              >
                <span>🛡️</span>

                <div>
                  <h3>Responder Portal</h3>

                  <p>
                    For emergency responders
                  </p>
                </div>

                <span className="role-arrow">
                  →
                </span>
              </button>

              <button
                className="role-portal admin-role"
                onClick={openAdminPortal}
              >
                <span>🏢</span>

                <div>
                  <h3>Admin Portal</h3>

                  <p>
                    Command & management center
                  </p>
                </div>

                <span className="role-arrow">
                  →
                </span>
              </button>

            </div>

          </div>
        )}

        {/* ==========================
            CITIZEN PORTAL
        ========================== */}

        {portal === "citizen" &&
          renderCitizenPortal()}

        {/* ==========================
            RESPONDER PORTAL
        ========================== */}

        {portal === "responder" &&
          renderResponderPortal()}

        {/* ==========================
            ADMIN PORTAL
        ========================== */}

        {portal === "admin" &&
          renderAdminPortal()}

        {/* FOOTER */}

        <div className="footer-text">
          Your safety. Our priority.
        </div>

      </div>

    </div>
  );
}

export default App;

// CureByMedi Language System

const LANG = {
    en: {
        dashboard_title: "Find your medicine",
        dashboard_subtitle: "Search 250,000+ Indian medicines by name or composition.",
        search: "Search",
        search_placeholder: "e.g. Dolo, Paracetamol, Azithromycin…",
        photo_scan: "Photo scan",
        identify_photo: "Identify by photo",
        interactions: "Interactions",
        safe_together: "Safe together?",
        symptoms: "Symptoms",
        ai_suggestions: "AI suggestions",
        reminders: "Reminders",
        pill_alerts: "Pill alerts",
        compare: "Compare",
        side_by_side: "Side by side",
        favorites: "Favorites",
        your_saved: "Your saved",
        popular_medicines: "Popular medicines",
        recently_viewed: "Recently viewed",
        load_more: "Load more",
        no_medicine: "No medicines found"
    },

    hi: {
        dashboard_title: "अपनी दवा खोजें",
        dashboard_subtitle: "भारत की 2,50,000+ दवाओं को नाम या कंपोज़िशन से खोजें।",
        search: "खोजें",
        search_placeholder: "जैसे Dolo, Paracetamol, Azithromycin...",
        photo_scan: "फोटो स्कैन",
        identify_photo: "फोटो से पहचानें",
        interactions: "दवा इंटरैक्शन",
        safe_together: "क्या साथ लेना सुरक्षित है?",
        symptoms: "लक्षण",
        ai_suggestions: "AI सुझाव",
        reminders: "रिमाइंडर",
        pill_alerts: "दवा अलर्ट",
        compare: "तुलना",
        side_by_side: "साथ-साथ तुलना",
        favorites: "पसंदीदा",
        your_saved: "आपकी सेव की हुई",
        popular_medicines: "लोकप्रिय दवाएँ",
        recently_viewed: "हाल ही में देखी गई",
        load_more: "और देखें",
        no_medicine: "कोई दवा नहीं मिली"
    }
};

function T(key) {
    const lang = getLang();
    return LANG[lang]?.[key] || LANG.en[key] || key;
}
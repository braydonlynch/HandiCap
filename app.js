const STORAGE_KEY = "handicap_rounds";
const ACTIVE_KEY = "handicap_active_round";

function loadSaved(key, fallback) {
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        return saved ?? fallback;
    } catch {
        return fallback;
    }
}

let rounds = loadSaved(STORAGE_KEY, []);
let activeRound = loadSaved(ACTIVE_KEY, null);
let historyFilter = "all";
let selectedRoundId = null;

if (!Array.isArray(rounds)) rounds = [];

if (activeRound && !Number.isInteger(activeRound.currentHole)) {
    activeRound.currentHole = 1;
}

function saveRounds() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
}

function saveActive() {
    if (activeRound) {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeRound));
    } else {
        localStorage.removeItem(ACTIVE_KEY);
    }
}

function getLocalDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    if (!value) return "Unknown date";

    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatToPar(value) {
    if (!Number.isFinite(value)) return "--";
    if (value === 0) return "E";
    return value > 0 ? `+${value}` : String(value);
}

function makeId() {
    if (globalThis.crypto?.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortedRounds(list = rounds) {
    return [...list].sort((a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        (b.savedAt || "").localeCompare(a.savedAt || "")
    );
}

function getRoundStats(holeCount) {
    const matching = rounds.filter(round =>
        Number(round.holeCount) === holeCount &&
        Number.isFinite(Number(round.totalStrokes))
    );

    if (!matching.length) {
        return { count: 0, average: "--", best: "--" };
    }

    const scores = matching.map(round => Number(round.totalStrokes));

    return {
        count: matching.length,
        average: (scores.reduce((a, b) => a + b, 0) /
                  scores.length).toFixed(1),
        best: Math.min(...scores)
    };
}

function showPage(pageId) {
    if (pageId === "round" && !activeRound) {
        pageId = "setup";
    }

    document.querySelectorAll(".page").forEach(page => {
        page.classList.toggle("active", page.id === pageId);
    });

    const navPage =
        pageId === "setup" ? "dashboard" :
        pageId === "roundDetails" ? "history" :
        pageId;

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === navPage
        );
    });

    if (pageId === "dashboard") updateDashboard();
    if (pageId === "history") renderHistory();
    if (pageId === "round") renderRound();

    window.scrollTo({ top: 0, behavior: "instant" });
}

function openNewRound() {
    if (activeRound) {
        showPage("round");
        return;
    }

    document.getElementById("roundDate").value = getLocalDate();
    showPage("setup");
}

// ---------- START ROUND ----------

document.getElementById("roundForm").addEventListener("submit", event => {
    event.preventDefault();

    const courseName =
        document.getElementById("courseName").value.trim();

    const date = document.getElementById("roundDate").value;

    const holeCount = Number(
        document.querySelector('input[name="holes"]:checked').value
    );

    const courseRating = Number(
        document.getElementById("courseRating").value
    );

    const slopeRating = Number(
        document.getElementById("slopeRating").value
    );

    if (!courseName || !date ||
        !Number.isFinite(courseRating) ||
        !Number.isFinite(slopeRating) ||
        slopeRating < 55 || slopeRating > 155) {
        alert("Please enter valid round details.");
        return;
    }

    activeRound = {
        id: makeId(),
        courseName,
        date,
        holeCount,
        courseRating,
        slopeRating,
        currentHole: 1,
        holes: Array.from({ length: holeCount }, (_, index) => ({
            number: index + 1,
            par: 4,
            strokes: null
        }))
    };

    saveActive();
    showPage("round");
});

// ---------- ACTIVE SCORECARD ----------

function isScored(hole) {
    return Number.isFinite(hole.strokes) && hole.strokes > 0;
}

function getScoreLabel(hole) {
    if (!isScored(hole)) return "Not scored";

    const difference = hole.strokes - hole.par;

    if (difference <= -3) return "Albatross or better";
    if (difference === -2) return "Eagle";
    if (difference === -1) return "Birdie";
    if (difference === 0) return "Par";
    if (difference === 1) return "Bogey";
    if (difference === 2) return "Double Bogey";

    return formatToPar(difference);
}

function getScoreTotals() {
    const completed = activeRound.holes.filter(isScored);

    const strokes = completed.reduce(
        (sum, hole) => sum + hole.strokes, 0
    );

    const par = completed.reduce(
        (sum, hole) => sum + hole.par, 0
    );

    return {
        strokes,
        par,
        completed: completed.length,
        toPar: strokes - par
    };
}

function updateLiveSummary() {
    if (!activeRound) return;

    const totals = getScoreTotals();

    document.getElementById("liveStrokes").textContent =
        totals.strokes;

    document.getElementById("liveToPar").textContent =
        formatToPar(totals.toPar);

    document.getElementById("liveCompleted").textContent =
        `${totals.completed}/${activeRound.holeCount}`;

    document.getElementById("currentHoleLabel").textContent =
        `Hole ${activeRound.currentHole}`;

    document.getElementById("previousHole").disabled =
        activeRound.currentHole <= 1;

    document.getElementById("nextHole").disabled =
        activeRound.currentHole >= activeRound.holeCount;
}

function createScoreButton(symbol, action, holeNumber) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = symbol;
    button.dataset.action = action;
    button.dataset.hole = String(holeNumber);

    button.className =
        action === "minus" ? "minus-btn" : "plus-btn";

    button.setAttribute(
        "aria-label",
        `${action === "minus" ? "Subtract" : "Add"} stroke on hole ${holeNumber}`
    );

    return button;
}

function renderRound(scrollToCurrent = false) {
    if (!activeRound) return;

    document.getElementById("activeCourse").textContent =
        activeRound.courseName;

    document.getElementById("activeDetails").textContent =
        `${formatDate(activeRound.date)} • ${activeRound.holeCount} Holes`;

    const container = document.getElementById("scorecard");
    container.replaceChildren();

    activeRound.holes.forEach(hole => {
        const current = hole.number === activeRound.currentHole;

        const card = document.createElement("article");
        card.className = [
            "hole-card",
            current ? "current" : "",
            isScored(hole) ? "completed" : ""
        ].filter(Boolean).join(" ");

        card.dataset.hole = String(hole.number);

        const main = document.createElement("div");
        main.className = "hole-card-main";

        const number = document.createElement("div");
        number.className = "hole-number";

        const small = document.createElement("small");
        small.textContent = current ? "CURRENT HOLE" : "HOLE";

        const heading = document.createElement("strong");
        heading.textContent = String(hole.number);

        number.append(small, heading);

        const parSelect = document.createElement("select");
        parSelect.className = "par-select";
        parSelect.dataset.hole = String(hole.number);
        parSelect.setAttribute(
            "aria-label", `Par for hole ${hole.number}`
        );

        for (let par = 3; par <= 6; par++) {
            const option = document.createElement("option");
            option.value = String(par);
            option.textContent = `Par ${par}`;
            option.selected = par === hole.par;
            parSelect.append(option);
        }

        const score = document.createElement("div");
        score.className = "hole-score";

        const scoreNumber = document.createElement("strong");
        scoreNumber.textContent =
            isScored(hole) ? String(hole.strokes) : "–";

        const scoreLabel = document.createElement("span");
        scoreLabel.textContent = getScoreLabel(hole);

        score.append(scoreNumber, scoreLabel);

        const controls = document.createElement("div");
        controls.className = "score-controls";

        const minus = createScoreButton(
            "−", "minus", hole.number
        );

        const plus = createScoreButton(
            "+", "plus", hole.number
        );

        minus.disabled = !isScored(hole) || hole.strokes <= 1;

        controls.append(minus, plus);
        main.append(number, parSelect, score, controls);

        const badge = document.createElement("div");
        badge.className = "current-badge";
        badge.textContent = "● CURRENT HOLE";

        card.append(main, badge);
        container.append(card);
    });

    updateLiveSummary();

    if (scrollToCurrent) {
        requestAnimationFrame(() => {
            const current = container.querySelector(".hole-card.current");
            current?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        });
    }
}

function selectHole(number, scroll = true) {
    if (!activeRound ||
        number < 1 ||
        number > activeRound.holeCount) return;

    activeRound.currentHole = number;
    saveActive();
    renderRound(scroll);
}

document.getElementById("scorecard").addEventListener("click", event => {
    if (!activeRound) return;

    const button = event.target.closest("button[data-action]");

    if (button) {
        const number = Number(button.dataset.hole);
        const hole = activeRound.holes[number - 1];

        if (!hole) return;

        if (button.dataset.action === "plus") {
            hole.strokes = isScored(hole)
                ? hole.strokes + 1
                : hole.par;
        }

        if (button.dataset.action === "minus" && isScored(hole)) {
            hole.strokes = Math.max(1, hole.strokes - 1);
        }

        activeRound.currentHole = number;
        saveActive();
        renderRound(false);
        return;
    }

    if (event.target.closest("select")) return;

    const card = event.target.closest(".hole-card");
    if (card) {
        selectHole(Number(card.dataset.hole));
    }
});

document.getElementById("scorecard").addEventListener("change", event => {
    if (!activeRound || !event.target.matches(".par-select")) return;

    const number = Number(event.target.dataset.hole);
    const hole = activeRound.holes[number - 1];

    if (!hole) return;

    hole.par = Number(event.target.value);
    activeRound.currentHole = number;

    saveActive();
    renderRound(false);
});

document.getElementById("previousHole").addEventListener("click", () => {
    if (activeRound) selectHole(activeRound.currentHole - 1);
});

document.getElementById("nextHole").addEventListener("click", () => {
    if (activeRound) selectHole(activeRound.currentHole + 1);
});

// ---------- FINISH ROUND ----------

document.getElementById("finishRound").addEventListener("click", () => {
    if (!activeRound) return;

    const totals = getScoreTotals();

    if (totals.completed !== activeRound.holeCount) {
        alert(
            `You've scored ${totals.completed} of ${activeRound.holeCount} holes. ` +
            "Please finish scoring every hole first."
        );
        return;
    }

    if (!confirm("Finish and save this round?")) return;

    const totalPar = activeRound.holes.reduce(
        (sum, hole) => sum + hole.par, 0
    );

    const finished = {
        ...activeRound,
        totalStrokes: totals.strokes,
        totalPar,
        scoreToPar: totals.strokes - totalPar,
        officialDifferential: null,
        savedAt: new Date().toISOString()
    };

    delete finished.currentHole;

    rounds.push(finished);
    saveRounds();

    activeRound = null;
    saveActive();

    selectedRoundId = finished.id;
    viewRoundDetails(finished.id);
});

document.getElementById("discardRound").addEventListener("click", () => {
    if (!activeRound) return;

    if (!confirm("Discard this round? Your scores will be lost.")) {
        return;
    }

    activeRound = null;
    saveActive();
    showPage("dashboard");
});

// ---------- HANDICAP ESTIMATE ----------

// This is a simplified handicap estimate, NOT an official WHS Index.
// A published differential can be entered for either 9- or 18-hole rounds.
// Without a published differential, only 18-hole gross scores
// produce an approximate differential.

function calculateRawDifferential(round) {
    if (Number(round.holeCount) !== 18) return null;

    const strokes = Number(round.totalStrokes);
    const rating = Number(round.courseRating);
    const slope = Number(round.slopeRating);

    if (!Number.isFinite(strokes) ||
        !Number.isFinite(rating) ||
        !Number.isFinite(slope) ||
        slope <= 0) {
        return null;
    }

    return (113 / slope) * (strokes - rating);
}

function getDifferential(round) {
    if (typeof round.officialDifferential === "number" &&
        Number.isFinite(round.officialDifferential)) {
        return round.officialDifferential;
    }

    return calculateRawDifferential(round);
}

function calculateHandicap() {
    const eligible = sortedRounds()
        .map(getDifferential)
        .filter(value => value !== null)
        .slice(0, 20);

    if (eligible.length < 3) return null;

    eligible.sort((a, b) => a - b);

    const rules = {
        3: [1, -2],
        4: [1, -1],
        5: [1, 0],
        6: [2, -1],
        7: [2, 0],
        8: [2, 0],
        9: [3, 0],
        10: [3, 0],
        11: [3, 0],
        12: [4, 0],
        13: [4, 0],
        14: [4, 0],
        15: [5, 0],
        16: [5, 0],
        17: [6, 0],
        18: [6, 0],
        19: [7, 0],
        20: [8, 0]
    };

    const [count, adjustment] = rules[eligible.length];
    const best = eligible.slice(0, count);

    const average = best.reduce(
        (sum, value) => sum + value, 0
    ) / best.length;

    return Math.max(
        0,
        Math.round((average + adjustment) * 10) / 10
    );
}

// ---------- DASHBOARD ----------

function updateDashboard() {
    const holes = rounds.reduce(
        (sum, round) => sum + Number(round.holeCount || 0), 0
    );

    document.getElementById("totalRounds").textContent =
        rounds.length;

    document.getElementById("totalHoles").textContent =
        holes;

    const nine = getRoundStats(9);
    const eighteen = getRoundStats(18);

    document.getElementById("average9").textContent = nine.average;
    document.getElementById("best9").textContent = nine.best;
    document.getElementById("rounds9").textContent = nine.count;

    document.getElementById("average18").textContent = eighteen.average;
    document.getElementById("best18").textContent = eighteen.best;
    document.getElementById("rounds18").textContent = eighteen.count;

    document.getElementById("progressFill").style.width =
        `${Math.min(100, (holes / 54) * 100)}%`;

    document.getElementById("holesProgress").textContent =
        `${Math.min(holes, 54)} of 54 initial holes recorded`;

    const handicap = calculateHandicap();
    const value = document.getElementById("handicapValue");
    const status = document.getElementById("handicapStatus");

    if (holes < 54) {
        value.textContent = "--";
        status.textContent =
            `${54 - holes} more holes until the initial eligibility milestone.`;
    } else if (handicap === null) {
        value.textContent = "--";
        status.textContent =
            "More eligible score differentials are needed.";
    } else {
        value.textContent = handicap.toFixed(1);
        status.textContent =
            "Unofficial estimate. Nine-hole rounds require a published differential.";
    }

    renderRoundList(
        document.getElementById("recentRounds"),
        sortedRounds().slice(0, 3)
    );
}

// ---------- ROUND HISTORY ----------

function renderRoundList(container, list) {
    container.replaceChildren();

    if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No saved rounds to show yet.";
        container.append(empty);
        return;
    }

    list.forEach(round => {
        const item = document.createElement("div");
        item.className = "round-item";

        const open = document.createElement("button");
        open.className = "round-open";
        open.type = "button";

        const course = document.createElement("strong");
        course.textContent = round.courseName;

        const meta = document.createElement("small");
        meta.textContent =
            `${formatDate(round.date)} • ${round.holeCount} Holes`;

        open.append(course, meta);
        open.addEventListener("click", () => {
            viewRoundDetails(round.id);
        });

        const result = document.createElement("div");
        result.className = "round-result";

        const strokes = document.createElement("strong");
        strokes.textContent = String(round.totalStrokes);

        const toPar = document.createElement("small");
        toPar.textContent = formatToPar(Number(round.scoreToPar));

        result.append(strokes, toPar);
        item.append(open, result);
        container.append(item);
    });
}

function renderHistory() {
    const filtered = sortedRounds().filter(round =>
        historyFilter === "all" ||
        Number(round.holeCount) === Number(historyFilter)
    );

    renderRoundList(
        document.getElementById("historyRounds"),
        filtered
    );

    document.querySelectorAll(".filter-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.filter === historyFilter
        );
    });
}

document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
        historyFilter = button.dataset.filter;
        renderHistory();
    });
});

// ---------- SAVED ROUND DETAILS ----------

function viewRoundDetails(id) {
    const round = rounds.find(item => item.id === id);
    if (!round) return;

    selectedRoundId = id;

    document.getElementById("detailsCourse").textContent =
        round.courseName;

    document.getElementById("detailsDate").textContent =
        `${formatDate(round.date)} • ${round.holeCount} Holes`;

    document.getElementById("detailsStrokes").textContent =
        round.totalStrokes;

    document.getElementById("detailsToPar").textContent =
        formatToPar(Number(round.scoreToPar));

    document.getElementById("detailsHoles").textContent =
        round.holeCount;

    document.getElementById("detailsRating").textContent =
        round.courseRating ?? "--";

    document.getElementById("detailsSlope").textContent =
        round.slopeRating ?? "--";

    const differential = getDifferential(round);

    document.getElementById("detailsDifferential").textContent =
        differential === null ? "--" : differential.toFixed(1);

    const container = document.getElementById("detailsScorecard");
    container.replaceChildren();

    const table = document.createElement("table");
    table.className = "scorecard-table";

    const header = document.createElement("tr");

    function addCell(row, text, heading = false, className = "") {
        const cell = document.createElement(heading ? "th" : "td");
        cell.textContent = String(text);
        if (className) cell.className = className;
        row.append(cell);
    }

    addCell(header, "HOLE", true);

    round.holes.forEach(hole => {
        addCell(header, hole.number, true);
    });

    addCell(header, "TOTAL", true);

    const thead = document.createElement("thead");
    thead.append(header);
    table.append(thead);

    const tbody = document.createElement("tbody");

    const parRow = document.createElement("tr");
    addCell(parRow, "PAR");

    round.holes.forEach(hole => {
        addCell(parRow, hole.par);
    });

    addCell(parRow, round.totalPar);
    tbody.append(parRow);

    const strokesRow = document.createElement("tr");
    addCell(strokesRow, "STROKES");

    round.holes.forEach(hole => {
        const difference = hole.strokes - hole.par;
        const className =
            difference < 0 ? "score-under" :
            difference > 0 ? "score-over" : "";

        addCell(strokesRow, hole.strokes, false, className);
    });

    addCell(strokesRow, round.totalStrokes);
    tbody.append(strokesRow);

    const toParRow = document.createElement("tr");
    addCell(toParRow, "TO PAR");

    round.holes.forEach(hole => {
        addCell(
            toParRow,
            formatToPar(hole.strokes - hole.par)
        );
    });

    addCell(toParRow, formatToPar(Number(round.scoreToPar)));
    tbody.append(toParRow);

    table.append(tbody);
    container.append(table);

    showPage("roundDetails");
}

document.getElementById("backToHistory").addEventListener("click", () => {
    showPage("history");
});

document.getElementById("editDifferential").addEventListener("click", () => {
    const round = rounds.find(item => item.id === selectedRoundId);
    if (!round) return;

    const current = round.officialDifferential ?? "";

    const answer = prompt(
        "Enter the published 18-hole equivalent Score Differential.\n" +
        "Leave blank to remove it.",
        String(current)
    );

    if (answer === null) return;

    if (answer.trim() === "") {
        round.officialDifferential = null;
    } else {
        const number = Number(answer);

        if (!Number.isFinite(number) ||
            number < -10 || number > 100) {
            alert("Please enter a valid differential.");
            return;
        }

        round.officialDifferential = number;
    }

    saveRounds();
    viewRoundDetails(round.id);
});

document.getElementById("deleteDetailsRound")
    .addEventListener("click", () => {
        const round = rounds.find(
            item => item.id === selectedRoundId
        );

        if (!round) return;

        if (!confirm(`Delete your round at ${round.courseName}?`)) {
            return;
        }

        rounds = rounds.filter(item => item.id !== selectedRoundId);
        selectedRoundId = null;

        saveRounds();
        showPage("history");
    });

// ---------- NAVIGATION ----------

document.querySelectorAll(".new-round").forEach(button => {
    button.addEventListener("click", openNewRound);
});

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

// ---------- INITIALIZE ----------

document.getElementById("roundDate").value = getLocalDate();

if (activeRound) {
    showPage("round");
} else {
    showPage("dashboard");
}

// Register offline support when hosted on HTTPS or localhost.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .catch(error => {
                console.warn("Offline support unavailable:", error);
            });
    });
}
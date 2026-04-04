const STORAGE_KEY = "cricket-over-counter-state";
const OVERS_PER_INNINGS = 16;
const BALLS_PER_OVER = 6;
const BALLS_PER_INNINGS = OVERS_PER_INNINGS * BALLS_PER_OVER;

const scoreDisplay = document.querySelector("#scoreDisplay");
const oversDisplay = document.querySelector("#oversDisplay");
const extrasDisplay = document.querySelector("#extrasDisplay");
const runRateDisplay = document.querySelector("#runRateDisplay");
const inningsDisplay = document.querySelector("#inningsDisplay");
const battingNowDisplay = document.querySelector("#battingNowDisplay");
const statusDisplay = document.querySelector("#statusDisplay");
const inningsTitle = document.querySelector("#inningsTitle");
const teamAInput = document.querySelector("#teamAInput");
const teamBInput = document.querySelector("#teamBInput");
const currentOverChips = document.querySelector("#currentOverChips");
const scorebookPanels = document.querySelector("#scorebookPanels");
const overStatus = document.querySelector("#overStatus");
const runButtons = document.querySelector("#runButtons");
const undoButton = document.querySelector("#undoButton");
const newOverButton = document.querySelector("#newOverButton");

const defaultState = () => ({
  teamA: "Team A",
  teamB: "Team B",
  innings: [[], []]
});

let state = loadState();

function loadState() {
  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(saved);

    if (Array.isArray(parsed.innings) && parsed.innings.length === 2) {
      return {
        ...defaultState(),
        ...parsed
      };
    }

    if (Array.isArray(parsed.events)) {
      return {
        teamA: parsed.battingTeam || "Team A",
        teamB: parsed.bowlingTeam || "Team B",
        innings: [parsed.events, []]
      };
    }

    if (Array.isArray(parsed.timeline)) {
      return {
        teamA: parsed.battingTeam || "Team A",
        teamB: parsed.bowlingTeam || "Team B",
        innings: [
          parsed.timeline
            .slice()
            .reverse()
            .map((entry) => {
              const type = entry.wicket ? "wicket" : entry.extras ? "extra" : "runs";
              const value = type === "runs" ? Number(entry.label) : entry.label;
              return makeEvent(type, value);
            })
            .filter(Boolean),
          []
        ]
      };
    }

    return defaultState();
  } catch {
    return defaultState();
  }
}

function persistState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeEvent(type, value) {
  switch (type) {
    case "runs":
      return {
        type,
        label: `${value}`,
        legalBall: true,
        runs: value,
        extras: 0,
        wicket: 0,
        chipClass: ""
      };
    case "extra":
      return {
        type,
        label: value,
        legalBall: false,
        runs: 1,
        extras: 1,
        wicket: 0,
        chipClass: "extra"
      };
    case "wicket":
      return {
        type,
        label: "W",
        legalBall: true,
        runs: 0,
        extras: 0,
        wicket: 1,
        chipClass: "wicket"
      };
    default:
      return null;
  }
}

function deriveInnings(events) {
  const summary = {
    totalRuns: 0,
    wickets: 0,
    extras: 0,
    legalBalls: 0,
    currentOver: {
      number: 1,
      legalBalls: 0,
      runs: 0,
      events: []
    },
    scorebook: [],
    complete: false
  };

  let workingOver = {
    number: 1,
    legalBalls: 0,
    runs: 0,
    events: []
  };

  events.forEach((event) => {
    summary.totalRuns += event.runs;
    summary.wickets += event.wicket;
    summary.extras += event.extras;
    workingOver.events.push(event);
    workingOver.runs += event.runs;

    if (event.legalBall) {
      workingOver.legalBalls += 1;
      summary.legalBalls += 1;
    }

    if (workingOver.legalBalls === BALLS_PER_OVER) {
      summary.scorebook.push({
        ...workingOver,
        complete: true,
        score: `${summary.totalRuns}/${summary.wickets}`
      });
      workingOver = {
        number: summary.scorebook.length + 1,
        legalBalls: 0,
        runs: 0,
        events: []
      };
    }
  });

  if (workingOver.events.length) {
    summary.scorebook.push({
      ...workingOver,
      complete: false,
      score: `${summary.totalRuns}/${summary.wickets}`
    });
  }

  summary.currentOver = workingOver;
  summary.complete = summary.legalBalls >= BALLS_PER_INNINGS;
  return summary;
}

function formatOvers(legalBalls) {
  return `${Math.floor(legalBalls / BALLS_PER_OVER)}.${legalBalls % BALLS_PER_OVER}`;
}

function calculateRunRate(totalRuns, legalBalls) {
  if (legalBalls === 0) {
    return "0.00";
  }

  return ((totalRuns * BALLS_PER_OVER) / legalBalls).toFixed(2);
}

function inningsConfigs() {
  return [
    { batting: state.teamA.trim() || "Team A", bowling: state.teamB.trim() || "Team B" },
    { batting: state.teamB.trim() || "Team B", bowling: state.teamA.trim() || "Team A" }
  ];
}

function matchMeta() {
  const configs = inningsConfigs();
  const summaries = state.innings.map((events) => deriveInnings(events));
  const firstClosed = summaries[0].complete;
  const target = firstClosed ? summaries[0].totalRuns + 1 : null;
  const chaseReached = firstClosed && summaries[1].totalRuns >= target;
  const secondClosed = firstClosed && (summaries[1].complete || chaseReached);
  const matchComplete = secondClosed;
  const activeInningsIndex = firstClosed ? 1 : 0;

  return {
    configs,
    summaries,
    firstClosed,
    target,
    chaseReached,
    secondClosed,
    matchComplete,
    activeInningsIndex
  };
}

function renderCurrentOver(summary, matchComplete) {
  currentOverChips.innerHTML = "";

  if (!summary.currentOver.events.length) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = matchComplete ? "Innings closed" : "No balls yet";
    currentOverChips.appendChild(chip);
    return;
  }

  summary.currentOver.events.forEach((event) => {
    const chip = document.createElement("span");
    chip.className = `chip ${event.chipClass}`.trim();
    chip.textContent = event.label;
    currentOverChips.appendChild(chip);
  });
}

function renderScorebookPanels(summaries, configs, activeInningsIndex) {
  scorebookPanels.innerHTML = "";

  summaries.forEach((summary, index) => {
    const block = document.createElement("section");
    block.className = "innings-block";

    const badge = summary.complete
      ? '<span class="innings-badge complete">Closed</span>'
      : index === activeInningsIndex
        ? '<span class="innings-badge live">Live</span>'
        : '<span class="innings-badge waiting">Waiting</span>';

    const rows = summary.scorebook.length
      ? summary.scorebook.map((over) => `
          <tr>
            <td>${over.number}</td>
            <td>${over.events.map((event) => event.label).join(" · ")}</td>
            <td>${over.runs}</td>
            <td>${over.score}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="4">No overs recorded yet.</td></tr>';

    block.innerHTML = `
      <div class="innings-block-header">
        <div>
          <h3>Innings ${index + 1}</h3>
          <p>${configs[index].batting} batting</p>
        </div>
        ${badge}
      </div>
      <div class="table-wrap">
        <table class="scorebook-table">
          <thead>
            <tr>
              <th>Over</th>
              <th>Balls</th>
              <th>Runs</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    scorebookPanels.appendChild(block);
  });
}

function matchStatusText(meta) {
  const { configs, summaries, firstClosed, matchComplete, target } = meta;

  if (!firstClosed) {
    return `${BALLS_PER_INNINGS - summaries[0].legalBalls} balls left`;
  }

  if (!matchComplete) {
    return `${Math.max(target - summaries[1].totalRuns, 0)} from ${BALLS_PER_INNINGS - summaries[1].legalBalls}`;
  }

  if (summaries[1].totalRuns >= target) {
    return `${configs[1].batting} won`;
  }

  if (summaries[1].totalRuns === summaries[0].totalRuns) {
    return "Match tied";
  }

  return `${configs[0].batting} won`;
}

function overStatusText(meta) {
  const { configs, summaries, activeInningsIndex, firstClosed, matchComplete, target } = meta;
  const activeSummary = summaries[activeInningsIndex];

  if (!firstClosed) {
    return `${activeSummary.currentOver.legalBalls} legal balls in over ${activeSummary.currentOver.number} of ${OVERS_PER_INNINGS}`;
  }

  if (!matchComplete) {
    return `${configs[1].batting} need ${Math.max(target - summaries[1].totalRuns, 0)} runs from ${BALLS_PER_INNINGS - summaries[1].legalBalls} balls`;
  }

  if (summaries[1].totalRuns >= target) {
    return `${configs[1].batting} chased ${target} in ${formatOvers(summaries[1].legalBalls)} overs`;
  }

  if (summaries[1].totalRuns === summaries[0].totalRuns) {
    return `Scores level after ${OVERS_PER_INNINGS} overs each`;
  }

  return `${configs[0].batting} defended ${summaries[0].totalRuns}`;
}

function render() {
  const meta = matchMeta();
  const { configs, summaries, activeInningsIndex, matchComplete } = meta;
  const activeSummary = summaries[activeInningsIndex];

  inningsTitle.textContent = `${configs[0].batting} vs ${configs[1].batting}`;
  inningsDisplay.textContent = matchComplete ? "Complete" : `Innings ${activeInningsIndex + 1}`;
  battingNowDisplay.textContent = matchComplete ? "-" : configs[activeInningsIndex].batting;
  scoreDisplay.textContent = `${activeSummary.totalRuns}/${activeSummary.wickets}`;
  oversDisplay.textContent = formatOvers(activeSummary.legalBalls);
  extrasDisplay.textContent = `${activeSummary.extras}`;
  runRateDisplay.textContent = calculateRunRate(activeSummary.totalRuns, activeSummary.legalBalls);
  statusDisplay.textContent = matchStatusText(meta);
  overStatus.textContent = overStatusText(meta);
  teamAInput.value = state.teamA;
  teamBInput.value = state.teamB;
  undoButton.disabled = state.innings[0].length === 0 && state.innings[1].length === 0;

  renderCurrentOver(activeSummary, matchComplete);
  renderScorebookPanels(summaries, configs, activeInningsIndex);
}

function addEvent(type, value) {
  const meta = matchMeta();

  if (meta.matchComplete) {
    return;
  }

  const event = makeEvent(type, value);

  if (!event) {
    return;
  }

  state.innings[meta.activeInningsIndex].push(event);
  persistState();
  render();
}

function updateTeamName(key, value) {
  state[key] = value;
  persistState();
  render();
}

function undoLastEvent() {
  if (state.innings[1].length) {
    state.innings[1].pop();
  } else if (state.innings[0].length) {
    state.innings[0].pop();
  } else {
    return;
  }

  persistState();
  render();
}

function resetInnings() {
  state = {
    ...defaultState(),
    teamA: state.teamA,
    teamB: state.teamB
  };
  persistState();
  render();
}

runButtons.addEventListener("click", (event) => {
  const target = event.target.closest("button");

  if (!target) {
    return;
  }

  const { type, value } = target.dataset;
  addEvent(type, type === "runs" ? Number(value) : value);
});

teamAInput.addEventListener("input", (event) => {
  updateTeamName("teamA", event.target.value);
});

teamBInput.addEventListener("input", (event) => {
  updateTeamName("teamB", event.target.value);
});

undoButton.addEventListener("click", undoLastEvent);
newOverButton.addEventListener("click", resetInnings);

render();

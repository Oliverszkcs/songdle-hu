import { CFG, $, artistLine, trackLabel, toast } from "./core.js?v=60";
import { isReported, catLabel, setReported } from "./pool.js?v=60";
import { category, round, versus } from "./state.js?v=60";

// ---------- Dal jelentése ----------
const reportBtn = $("reportBtn"), reportDialog = $("reportDialog");

export function renderReportBtn() {
  if (!round) return;
  const on = isReported(round.track.id);
  reportBtn.classList.toggle("reported", on);
  reportBtn.lastElementChild.textContent = on ? "Jelentve · visszavonás" : "Jelentés";
}

// A jelentést a háttérben elküldjük (worker/report.js), az a fejlesztő nevében nyit
// GitHub-hibajegyet. A játékos ebből semmit nem lát; ha nincs beállítva, csak helyben marad.
function sendReport(t, reason) {
  if (!CFG.REPORT_ENDPOINT) return;
  const modeText = round.mode === "daily" ? "napi dal" : round.mode === "versus" ? versus.kind
    : round.mode === "stream" ? "streamer vs chat"
    : `végtelen · ${catLabel(category)}`;
  fetch(CFG.REPORT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: t.id, title: t.title, artist: artistLine(t), album: t.album, reason, mode: modeText }),
    keepalive: true,
  }).catch((e) => console.warn("Jelentés küldése sikertelen:", e));
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  reportBtn.addEventListener("click", () => {
    if (!round) return;
    const t = round.track;
    if (isReported(t.id)) {
      setReported(t, null);
      renderReportBtn();
      toast("Jelentés visszavonva.");
      return;
    }
    $("reportSong").textContent = trackLabel(t);
    reportDialog.returnValue = "";
    reportDialog.showModal();
    reportDialog.scrollTop = 0;
  });

  reportDialog.addEventListener("close", () => {
    const reason = reportDialog.returnValue;
    if (!reason || !round) return;
    setReported(round.track, reason);
    sendReport(round.track, reason);
    renderReportBtn();
    toast("Köszi a jelentést! ⚑");
  });
}

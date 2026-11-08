import { RotateCcw } from "lucide-react";
import { useState } from "react";

export function Header({ saved, question, onClear }: { saved: boolean; question: string; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <header className="site-header">
      <div className="header-bar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            2
          </span>
          <div>
            <p className="wordmark">
              What<span>2</span>Watch
            </p>
            <p className="tagline">Decide, then press play.</p>
          </div>
        </div>
        <h1 className="header-question">{question}</h1>
        <div className="header-actions">
          <p className={saved ? "saved is-fresh" : "saved"} role="status">
            {saved ? "Saved" : "On this device"}
          </p>
          {confirming ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirming(false);
                  onClear();
                }}
              >
                Clear table
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
              <RotateCcw size={16} aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

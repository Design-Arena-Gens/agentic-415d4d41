import GlobeRecorder from "../components/GlobeRecorder";

export default function Page() {
  return (
    <main>
      <div className="container">
        <header className="header">
          <h1 className="title">India from Space ? Video Generator</h1>
          <a
            href="https://agentic-415d4d41.vercel.app"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#9fb1e6", textDecoration: "none" }}
          >
            Production URL
          </a>
        </header>

        <div className="panel stage">
          <div className="canvasWrap">
            <GlobeRecorder />
          </div>
          <aside className="sidebar">
            <h3 style={{ margin: 0 }}>How it works</h3>
            <p style={{ marginTop: 8, color: "#9fb1e6", lineHeight: 1.5 }}>
              This generates a flyover from space to India using your browser. It captures the
              Three.js canvas stream via the MediaRecorder API and produces a downloadable WebM video.
            </p>
            <ul style={{ margin: 0, paddingLeft: 16, color: "#cdd8ff" }}>
              <li>Choose resolution and duration</li>
              <li>Click Generate to render and record</li>
              <li>Download the resulting video file</li>
            </ul>
          </aside>
        </div>

        <footer className="footer">
          Built with Next.js, Three.js, and MediaRecorder. Textures courtesy of NASA/Three.js examples.
        </footer>
      </div>
    </main>
  );
}


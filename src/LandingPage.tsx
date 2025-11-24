import './styles/global.css'

const TESTIMONIALS = [
  { quote: "It's fun! This will be a great tool for teaching!", author: 'Chris T.' },
  { quote: "It's everything I was hoping it would be.", author: 'Christian G.' },
  { quote: 'It seems to work!', author: 'Chris R.' },
]

const isMobile = () => window.matchMedia('(max-width: 768px)').matches

export const LandingPage = () => {
  const handleLaunch = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isMobile()) {
      event.preventDefault()
      alert('Only Tactics needs a laptop or desktop for now. Mobile controls coming soon!')
    }
  }

  return (
    <div className="landing-shell">
      <header className="landing-hero">
        <p className="eyebrow">Community Sailing Project</p>
        <h1>Only Tactics</h1>
        <p className="lead">
          A multiplayer sailing rules sandbox that keeps the spray out of your face and the tactics
          front and center. Built in the open so sailors can teach, tweak, and race together.
        </p>
        <div className="landing-actions">
          <a
            className="cta"
            href="/app"
            aria-label="Launch the Only Tactics game client"
            onClick={handleLaunch}
          >
            Launch the Game
          </a>
          <a
            className="secondary"
            href="https://github.com/Smod9/onlytactics"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
        </div>
      </header>

      <section className="landing-section">
        <h2>Why should this exist?</h2>
        <p>
          Most sailing games try to simulate the whole ocean. This one does not. Rules, tactical
          choices, timing, and small human errors are a huge part of racing, and they are some of the
          hardest things to practice on the water.
        </p>
        <p>
          When you strip out spray, waves, sail trim, and boat handling, you can focus on the rules
          and tactics. It is intentionally a small multiplayer experience so you can learn without
          friction and laugh when you miss a wind shift. We&rsquo;re open-sourcing it so the
          community can tune the physics, add tools, and coach each other faster.
        </p>
      </section>

      <section className="landing-section">
        <h2>What sailors are saying</h2>
        <div className="testimonials">
          {TESTIMONIALS.map((t) => (
            <figure key={t.author} className="testimonial">
              <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption>&mdash; {t.author}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <p>
          Built by Sebastien Gouin-Davis with a little help from GPT-5.1 Codex High and the sailing
          community.
        </p>
        <p className="note">
          Want to help shape it? File an issue, send feedback, or drop into{' '}
          <code>/landing</code> to share ideas.
        </p>
      </footer>
    </div>
  )
}


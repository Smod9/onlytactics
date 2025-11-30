import './styles/global.css'

const TESTIMONIALS = [
  { quote: "It's fun! This will be a great tool for teaching!", author: 'Chris T.' },
  { quote: "It's everything I was hoping it would be.", author: 'Christian G.' },
  { quote: 'What an amazing tool, will benefit the sailing community globally.', author: 'John H. Head Coach Youth Sailing Program' },
  { quote: 'The Opti kids at the sailing school are going to love this!', author: 'Sky L. Director, Summer Sailing School' },
  { quote: 'A safety forward tool for teaching sailors!', author: 'Marine Search & Rescue Instructor ' },
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
        <div className="landing-hero-copy">
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
        </div>
        <div className="landing-hero-video">
          <div className="video-frame">
            <iframe
              src="https://player.vimeo.com/video/1140661321?h=65c7f6d923&title=0&byline=0&portrait=0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Only Tactics overview"
            />
          </div>
        </div>
      </header>
      <section className="landing-section">
        <h2>Mission Statement</h2>
        <p>
          Create the simplest and most fun place to learn real sailing tactics,
          because more honest sailors in the world will make the world a better place.
        </p>
      </section>
      <section className="landing-section">
        <h2>Purpose</h2>
        <p>
          Most sailing games waste effort on spray, waves, and spectacle. This one refuses to.
          Real life sailing has even more distractions with infinite control line distraction
          potential, rig tuning, sail shape, maneuver execution, sore bums etc.
        </p>
        <p>
          Many people don&rsquo;t realize how big of an impact the basics make. So much of
          &rsquo;sailing fast&rsquo; comes from understanding rules, reading shifts, managing
          crossings, and making better choices under pressure. Those skills are difficult to
          practice on the water from within the boat and with no Birds Eye view.
        </p>
        <p>Here they can be honed, replayed, and coached with a true birds-eye view.</p>
        <p>You&rsquo;ll be surprised (and delighted 😉) how spread out an identical fleet becomes.</p>
      </section>

      <section className="landing-section">
        <h2>Why We Think It Should Exist</h2>
        <p>
          There are already titles with beautiful spray and deep physics. A small, simple,
          multiplayer space removes friction and keeps attention on the decisions that separate
          champions from the rest. Miss a shift and laugh. Convert a loss into a teaching moment.
          Watch rules play out without chaos, ego, or crunching fiberglass.
        </p>
        <p>
          The goal is to help sailors of every level build the instincts that make real-world racing
          more fun.
        </p>
      </section>

      <section className="landing-section">
        <h2>What the world is saying</h2>
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


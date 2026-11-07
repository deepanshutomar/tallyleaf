import { PageHead, SheetArt } from './art';

export const SOCIALS = [
  { label: 'Instagram', href: 'https://www.instagram.com/deepanshutomarg' },
  { label: 'YouTube', href: 'https://www.youtube.com/@DeepanshuTomarJi' },
  { label: 'Website', href: 'https://deepanshutomar.in' },
  { label: 'Email', href: 'mailto:hello@deepanshutomar.in' },
];

export function Heart() {
  return (
    <svg className="heart" viewBox="0 0 24 22" aria-label="love" role="img">
      <path d="M12 21s-8.5-5.3-10.4-10.6C.3 6.6 2.7 2.5 6.6 2.1 9 1.9 10.9 3.2 12 5c1.1-1.8 3-3.1 5.4-2.9 3.9.4 6.3 4.5 5 8.3C20.5 15.7 12 21 12 21z" fill="currentColor" />
    </svg>
  );
}

const TIMELINE: [string, string, string][] = [
  ['1932', 'The scale', 'Rensis Likert publishes “A Technique for the Measurement of Attitudes”. Agree-to-disagree items become the default way psychology asks people how they feel.'],
  ['1938', 'The first reader', 'Reynold B. Johnson, a high-school teacher in Michigan, builds a machine that detects pencil marks by their electrical conductivity. IBM sells it as the IBM 805 Test Scoring Machine.'],
  ['1972', 'Bubble sheets everywhere', 'Optical mark readers replace special pencils, and Scantron makes fill-in-the-bubble forms a fixture of schools and exam halls.'],
  ['Now', 'Still typing', 'Those readers need special forms and machines most students never get near. So a lot of psychology research still ends with someone typing a pile of questionnaires into SPSS, one cell at a time.'],
];

export function About() {
  return (
    <div className="stack-lg about">
      <div className="hero-grid">
        <div className="stack">
          <PageHead title={<>About <em>Tallyleaf</em></>}
            lead="A paper-to-data research tool. You design a questionnaire, print numbered copies, and turn the filled pile into a clean spreadsheet with a phone camera." />
          <div className="prose">
            <p>
              Paper is still the easiest way to run a questionnaire in a classroom, a clinic waiting room or a village survey. Nobody needs a phone, a login or internet,
              and response rates are good. The painful part comes afterwards: entering every answer by hand, double-checking for typos, and coding reverse-scored items.
            </p>
            <p>
              Tallyleaf removes that step. Every printed copy carries a serial number, four corner squares and a small code. When you photograph a filled sheet,
              the code says whose sheet it is and which page; the corners let the photo be straightened; and the bubbles are read as the numbers you chose for
              your scale. Anything unclear (a faint mark, two ticks, a skipped item) is highlighted for you to check, with a picture of the original right next to it.
            </p>
          </div>
        </div>
        <div className="hero-art"><SheetArt pins /></div>
      </div>

      <section>
        <h2>A short history of filling in bubbles</h2>
        <ol className="timeline">
          {TIMELINE.map(([year, title, text]) => (
            <li key={year} className="panel grain">
              <span className="year">{year}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="principles">
        <h2>How it's built, and why</h2>
        <div className="principle-grid">
          <div className="panel grain"><h3>Runs in your browser</h3><p>Questions and answers never leave your device. There's no account and no server, which keeps ethics applications simple.</p></div>
          <div className="panel grain"><h3>One file holds the study</h3><p>The project file carries your questions, every printed batch and every scanned answer. Email it to a teammate and they can scan the other half of the pile.</p></div>
          <div className="panel grain"><h3>Free and open source</h3><p>MIT licensed. Use it for coursework, theses and published research. Improvements are welcome.</p></div>
        </div>
      </section>

      <section className="maker panel grain">
        <div>
          <h2>Made with <Heart /> by Deepanshu Tomar</h2>
          <p className="muted">Built for psychology students who have spent a weekend typing questionnaires into SPSS. If it saves you that weekend, say hi.</p>
        </div>
        <div className="socials">
          {SOCIALS.map((s) => <a key={s.label} className="btn" href={s.href} target="_blank" rel="noreferrer">{s.label}</a>)}
        </div>
      </section>
    </div>
  );
}

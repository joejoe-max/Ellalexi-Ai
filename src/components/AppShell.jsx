import { Link } from "react-router-dom";
import { ArrowUpRight, Scale } from "lucide-react";

export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="EllaLexi AI home">
          <span className="brand-mark" aria-hidden="true"><Scale size={19} strokeWidth={1.8} /></span>
          <span className="brand-name">ella<span>lexi</span><sup>AI</sup></span>
        </Link>

        <nav className="header-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#our-approach">Our approach</a>
        </nav>

        <a className="header-note" href="#disclaimer">
          Built for clarity <ArrowUpRight size={15} />
        </a>
      </header>

      <main>{children}</main>

      <footer className="site-footer" id="disclaimer">
        <div className="footer-brand">ella<span>lexi</span><sup>AI</sup></div>
        <p>Understand before you agree.</p>
        <p className="footer-disclaimer">
          EllaLexi AI provides document explanations and information, not legal representation or a substitute for advice from a qualified legal practitioner.
        </p>
        <span className="footer-country">Designed for Nigerian documents · Nigeria</span>
      </footer>
    </div>
  );
}

import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NotFoundPage() {
  return (
    <section className="not-found section-wrap">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>This page isn't<br /><em>in the papers.</em></h1>
      <p>The page you're looking for may have moved or may not exist.</p>
      <Link className="back-link" to="/"><ArrowLeft size={16} /> Back to EllaLexi</Link>
    </section>
  );
}

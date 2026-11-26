import {Link} from "react-router-dom";
import {ArrowLeft,ArrowUpRight,Scale,ShieldCheck,HeartHandshake,BookOpen,Users,VolumeX,FileCheck2,Quote} from "lucide-react";

const initiatives=[
 {number:"01",icon:Scale,title:"Legal education",tag:"KNOWLEDGE",text:"A weekly legal education series from the Office of the Attorney General, created to bring legal ideas closer to everyday student life."},
 {number:"02",icon:ShieldCheck,title:"Know Your Rights",tag:"CAMPUS SAFETY",text:"A campus awareness campaign on sexual and gender-based violence, delivered in partnership with Shield the Child Foundation. It focused on reporting pathways, survivor support and access to help."},
 {number:"03",icon:HeartHandshake,title:"Love & The Law",tag:"CONSENT & AWARENESS",text:"A weekly series exploring love and consent through the lens of the law — making important conversations easier for students to approach."},
 {number:"04",icon:FileCheck2,title:"Centralised oath-taking",tag:"STUDENT SERVICES",text:"Her 100-day report highlighted the centralisation of oath-taking and mass swearing-in ceremonies to make the process more organised."},
 {number:"05",icon:Users,title:"Student support",tag:"WELFARE",text:"The report also recorded the distribution of asthma relief supplies, sanitary pads and stationery to students."},
 {number:"06",icon:VolumeX,title:"The “No Noise” policy",tag:"CAMPUS CULTURE",text:"A policy initiative listed in her first-100-days report, reflecting an effort to promote order and responsibility within the student community."},
 {number:"07",icon:Users,title:"Faculty legal liaison network",tag:"ACCESS TO JUSTICE",text:"At a June 2026 town hall, the office decorated Faculty Liaison Officers with identification tags, establishing them as first points of contact for students with legal concerns in their faculties."}
];

export default function AboutPage(){return <main className="about-page section-wrap">
 <Link className="about-back" to="/"><ArrowLeft size={15}/> Back to home</Link>
 <section className="about-hero">
  <div className="eyebrow"><span className="eyebrow-dot"/> THE STORY BEHIND ELLABRIEF</div>
  <p className="about-hero-overline">A little clarity can change a big decision.</p>
  <h1>Before you sign,<br/> <em>understand.</em></h1>
  <p>Some of the most important decisions in life arrive wrapped in documents we barely understand. EllaBrief exists to make those documents less intimidating — and the decisions around them more informed.</p>
  <div className="about-hero-mark"><Scale size={18}/><span>UNDERSTAND BEFORE YOU AGREE</span></div>
 </section>
 <section className="about-story">
  <div className="about-story-label"><div className="about-kicker">01 / THE BEGINNING</div><h2>It started with an agreement I almost signed.</h2></div>
  <div className="about-story-copy">
   <p className="about-story-lead">I had a startup agreement in front of me. Something about it did not sit right.</p>
   <p>I could spot a few things that looked like red flags, but spotting a concern and understanding its legal meaning are two very different things. I did not want to make a decision based on a feeling — or sign something I could not properly explain.</p>
   <p>So I reached out to someone who had studied law and was still pursuing legal education. I asked for help understanding the agreement. Going through it together brought the clauses, obligations and possible consequences into focus. What I had suspected were concerns turned out to be serious enough for me to step back and decide not to sign.</p>
   <p>That experience stayed with me. I kept thinking about people who face the same kind of paperwork but do not have someone they can call — people who may sign because the language is complicated, the opportunity feels urgent, or they simply do not know what questions to ask.</p>
   <p className="about-story-punch">That is the gap EllaBrief was built to help close.</p>
   <p>EllaBrief uses AI to explain documents in clearer, more approachable language, highlight provisions that may deserve attention, and help people understand what they are being asked to agree to. It is a starting point for understanding — not a substitute for professional legal guidance.</p>
   <div className="about-boundary"><strong>A clear boundary</strong><br/>EllaBrief does not provide a lawyer’s opinion, determine whether you should sign, or replace advice from a qualified legal practitioner. When the stakes are significant or something is unclear, take the document to a qualified professional.</div>
  </div>
 </section>
 <section className="meet-section">
  <div className="meet-heading"><div className="about-kicker">02 / THE NAME BEHIND THE INSPIRATION</div><h2>Meet Ella.</h2><p>The person whose work helped give this project its name and human connection.</p></div>
  <div className="meet-profile">
   <div className="meet-photo-column"><div className="meet-photo-wrap"><img className="meet-photo" src="/ella-itoro-gabby.jpg" alt="Portrait of Ella Itoro Gabby" loading="lazy"/><div className="meet-photo-overlay">ELLA ITORO GABBY</div></div><div className="meet-photo-caption">STUDENT LEADERSHIP · LEGAL EDUCATION · SERVICE</div></div>
   <div className="meet-copy"><div className="meet-name-line"><div><h3>Ella Itoro Gabby</h3><p className="meet-role">Former Attorney General · Students’ Union Government, University of Uyo · 2025/26 session</p></div><div className="meet-monogram">EG</div></div>
    <p>During her tenure as Attorney General, Ella’s office highlighted legal education, student welfare and awareness of rights and responsibilities. She was sworn into office on 25 November 2025, and her tenure carried the slogan <strong>“We LISTEN to Judge.”</strong></p>
    <p>Her work brought legal conversations beyond formal settings and into the everyday experiences of students — from consent and campus safety to practical student services.</p>
    <div className="meet-quote"><Quote size={18}/><blockquote>“Fiat justitia ruat caelum.”</blockquote><span>LET JUSTICE BE DONE THOUGH THE HEAVENS FALL.</span></div>
   </div>
  </div>
  <div className="meet-work-heading"><div><div className="about-kicker">03 / WORK & INITIATIVES</div><h3>Service, beyond the title.</h3></div><p>A look at initiatives attributed to her office during the 2025/26 session.</p></div>
  <div className="meet-work">{initiatives.map(item=>{const Icon=item.icon;return <article className="meet-work-card" key={item.number}><div className="meet-card-top"><span>{item.number}</span><Icon size={20} strokeWidth={1.6}/></div><div className="meet-card-tag">{item.tag}</div><h4>{item.title}</h4><p>{item.text}</p></article>})}</div>
  <div className="meet-beyond">
  <div className="about-kicker">BEYOND THE ATTORNEY GENERAL'S OFFICE</div>
  <h3>Continuing the work.</h3>
  <p>In a public LinkedIn post, Itoro Gabriel wrote about speaking on “The Silent Struggles: When Young People Suffer in Silence” on 28 August 2026. The post also announced her appointment as Community Manager of the We4Us Project. These are later activities, separate from her SUG tenure.</p>
 </div>
 <div className="meet-social-links"><span>PUBLIC PROFILES</span><a href="https://www.facebook.com/profile.php?id=61582406414692" target="_blank" rel="noreferrer">Facebook <ArrowUpRight size={13}/></a><a href="https://ng.linkedin.com/in/itoro-gabriel-4b5623252" target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={13}/></a></div>
 <div className="meet-source-note">Profile details and initiative summaries are based on information supplied for this page and publicly indexed posts from the LinkedIn profile linked above. The Facebook profile link was supplied directly; Facebook did not expose its contents to this research session, so no additional claims have been attributed to it.</div>
 </section>
 <section className="about-closing"><div><div className="about-kicker">THE IDEA CONTINUES</div><h2>Understand the document.<br/><em>Then decide with clarity.</em></h2><p>Whatever the opportunity, know what the words mean before you put your name to them.</p></div><Link className="about-cta" to="/upload">Review a document <ArrowUpRight size={16}/></Link></section>
 </main>}

import {Route,Routes} from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import HomePage from "./pages/HomePage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
export default function App(){return <AppShell><Routes><Route path="/" element={<HomePage/>}/><Route path="/upload" element={<UploadPage/>}/><Route path="/about" element={<AboutPage/>}/><Route path="*" element={<NotFoundPage/>}/></Routes></AppShell>}
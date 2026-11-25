import {Route,Routes} from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import HomePage from "./pages/HomePage.jsx";
import UploadPage from "./pages/UploadPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
export default function App(){return <AppShell><Routes><Route path="/" element={<HomePage/>}/><Route path="/upload" element={<UploadPage/>}/><Route path="*" element={<NotFoundPage/>}/></Routes></AppShell>}
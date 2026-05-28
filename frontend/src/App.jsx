import React, { useState, useEffect, useRef } from "react";
import { 
  Calendar, 
  Cpu, 
  Search, 
  Download, 
  Play, 
  Terminal as TerminalIcon, 
  RefreshCw, 
  CheckCircle, 
  ChevronRight, 
  FileText, 
  ArrowLeft, 
  Layers, 
  Clock, 
  ExternalLink,
  BookOpen,
  Copy,
  Check,
  HelpCircle,
  Lock,
  Sparkles,
  ArrowRight,
  Info
} from "lucide-react";

// Pre-configured trial API key for the 1-article free trial
const TRIAL_API_KEY = "AIzaSyBsg9u4CBQZ__MojXeP6ViI3orHNt0dCto";

// Dynamic Backend URL for Production Deployments
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://pib-crawler-backend.onrender.com").replace(/\/$/, "");

export default function App() {
  // Scraper controls
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to past 7 days
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [workers, setWorkers] = useState(10);
  
  // Custom Gemini API Key (Empty by default, encouraging BYOK)
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem("gemini_api_key") || "";
  });
  
  // Scraper status & streaming
  const [statusState, setStatusState] = useState("idle"); // idle, scraping, completed, error, empty
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [currentStepText, setCurrentStepText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [discoveredCount, setDiscoveredCount] = useState(0);
  const [downloadCount, setDownloadCount] = useState(0);
  const [latestTitle, setLatestTitle] = useState("");
  
  // Articles data
  const [articles, setArticles] = useState([]);
  const [filteredArticles, setFilteredArticles] = useState([]);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMinistry, setSelectedMinistry] = useState("All");
  const [ministries, setMinistries] = useState([]);
  
  // Reader & AI view states
  const [activeArticle, setActiveArticle] = useState(null);
  const [activeTab, setActiveTab] = useState("article"); // article, notes
  const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
  const [noteGenerationError, setNoteGenerationError] = useState("");
  const [copied, setCopied] = useState(false);

  // Free Trial & Onboarding Tour states
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [modalInputKey, setModalInputKey] = useState("");
  const [tourStep, setTourStep] = useState(null); // null if not active, 1, 2, 3, 4
  const [trialUsedArticles, setTrialUsedArticles] = useState(() => {
    const parsed = JSON.parse(localStorage.getItem("pib_trial_articles_used") || "[]");
    return parsed;
  });

  const logsEndRef = useRef(null);

  // Sync custom API Key to localStorage
  useEffect(() => {
    localStorage.setItem("gemini_api_key", geminiApiKey);
  }, [geminiApiKey]);

  // Sync trial articles to localStorage
  useEffect(() => {
    localStorage.setItem("pib_trial_articles_used", JSON.stringify(trialUsedArticles));
  }, [trialUsedArticles]);

  // Auto-trigger tour on first visit
  useEffect(() => {
    const tourCompleted = localStorage.getItem("pib_tour_completed");
    if (!tourCompleted) {
      setTourStep(1);
    }
  }, []);

  // Auto-scroll logs terminal
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs]);

  // Handle article filtering
  useEffect(() => {
    if (articles.length === 0) return;
    
    let filtered = [...articles];
    
    // 1. Search Query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(art => 
        art.title.toLowerCase().includes(q) || 
        (art.content_text && art.content_text.toLowerCase().includes(q)) || 
        art.article_id.includes(q)
      );
    }
    
    // 2. Ministry Filter
    if (selectedMinistry !== "All") {
      filtered = filtered.filter(art => art.ministry === selectedMinistry);
    }
    
    setFilteredArticles(filtered);
  }, [articles, searchQuery, selectedMinistry]);

  // Extract list of unique ministries for filter dropdown
  useEffect(() => {
    if (articles.length === 0) return;
    const mins = ["All", ...new Set(articles.map(art => art.ministry).filter(Boolean))];
    setMinistries(mins.sort());
  }, [articles]);

  // Reset tab and error when switching active article
  useEffect(() => {
    setActiveTab("article");
    setNoteGenerationError("");
  }, [activeArticle]);

  // Trigger Server-Sent Events (SSE) Scraper Connection
  const handleStartScrape = () => {
    if (new Date(startDate) > new Date(endDate)) {
      alert("Error: Start date must be prior to or equal to End date.");
      return;
    }

    setTerminalLogs([]);
    setProgressPercent(0);
    setDiscoveredCount(0);
    setDownloadCount(0);
    setLatestTitle("");
    setArticles([]);
    setFilteredArticles([]);
    setStatusState("scraping");
    setCurrentStepText("Establishing secure session...");

    const logLine = (msg, type = "info") => {
      const timestamp = new Date().toLocaleTimeString();
      setTerminalLogs(prev => [...prev, { text: msg, type, time: timestamp }]);
    };

    logLine(`Starting scraper process range: ${startDate} to ${endDate}`, "system");
    logLine(`Configuring parallel thread pool size: ${workers} workers`, "system");

    const sseUrl = `${API_BASE_URL}/api/scrape/stream?start=${startDate}&end=${endDate}&workers=${workers}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        switch (type) {
          case "init":
            logLine(data, "info");
            setCurrentStepText("Connecting to PIB Archive...");
            break;
            
          case "indexing_start":
            logLine(data, "info");
            setCurrentStepText("Searching index catalog...");
            break;
            
          case "indexing":
            logLine(data, "info");
            setCurrentStepText(data);
            break;
            
          case "indexing_completed":
            setDiscoveredCount(data);
            logLine(`Discovered ${data} articles matching parameters.`, "success");
            setCurrentStepText(`Discovered ${data} releases.`);
            break;
            
          case "download_start":
            logLine(`Spinning up thread pool. Downloading body text for ${data} articles...`, "info");
            setCurrentStepText("Initializing worker threads...");
            break;
            
          case "downloading":
            const { completed, total, percent, latest_title } = data;
            setDownloadCount(completed);
            setProgressPercent(percent);
            setLatestTitle(latest_title);
            setCurrentStepText(`Downloading bodies: ${completed}/${total} completed (${percent}%)`);
            
            if (completed % 3 === 0 || completed === total) {
              logLine(`Progress: Fetching body for "${latest_title.substring(0, 45)}..." [${completed}/${total}]`, "progress");
            }
            break;
            
          case "download_completed":
            logLine(`Successfully extracted ${data} complete article datasets.`, "success");
            break;
            
          case "completed":
            logLine("Structuring full dataset payload...", "info");
            logLine(`Success! Compiled ${data.length} articles into JSON.`, "success");
            setArticles(data);
            setFilteredArticles(data);
            setStatusState("completed");
            eventSource.close();
            break;
            
          case "empty":
            logLine(data, "warning");
            setStatusState("empty");
            eventSource.close();
            break;
            
          case "error":
            logLine(`FATAL: ${data}`, "error");
            setStatusState("error");
            eventSource.close();
            break;
            
          default:
            break;
        }
      } catch (err) {
        logLine(`Failed to parse SSE packet: ${err}`, "error");
      }
    };

    eventSource.onerror = (err) => {
      logLine(`Network connection lost or backend offline. Please verify FastAPI is running at ${API_BASE_URL}.`, "error");
      setStatusState("error");
      eventSource.close();
    };
  };

  // Generate First-Principle Notes using Gemini API (with trial logic)
  const handleGenerateNotes = async (overrideKey = null) => {
    if (!activeArticle) return;
    
    const userKey = overrideKey || geminiApiKey.trim();
    const usingTrial = userKey === "";
    
    // Free Trial Checker logic
    if (usingTrial) {
      // If this specific article was already processed under trial, allow re-reading/re-generating it
      if (trialUsedArticles.includes(activeArticle.article_id)) {
        // Proceed with trial key
      } else {
        // Check if 1-article trial is exhausted
        if (trialUsedArticles.length >= 1) {
          setShowTrialModal(true);
          return;
        }
      }
    }

    const keyToSubmit = usingTrial ? TRIAL_API_KEY : userKey;

    setIsGeneratingNotes(true);
    setNoteGenerationError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gemini-API-Key": keyToSubmit
        },
        body: JSON.stringify({
          title: activeArticle.title,
          content_text: activeArticle.content_text
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to generate AI study notes.");
      }

      const result = await response.json();
      
      // Update article notes locally
      const updatedArticle = { ...activeArticle, notes: result.notes };
      setActiveArticle(updatedArticle);
      
      // Cache inside articles array
      setArticles(prev => prev.map(art => 
        art.article_id === activeArticle.article_id ? updatedArticle : art
      ));

      // If successfully generated using trial key, lock that article ID
      if (usingTrial && !trialUsedArticles.includes(activeArticle.article_id)) {
        setTrialUsedArticles(prev => [...prev, activeArticle.article_id]);
      }
      
    } catch (err) {
      setNoteGenerationError(err.message || "An error occurred during AI analysis.");
    } finally {
      setIsGeneratingNotes(false);
    }
  };

  const handleUnlockUnlimited = () => {
    if (!modalInputKey.trim()) {
      alert("Please enter a valid API key.");
      return;
    }
    const key = modalInputKey.trim();
    setGeminiApiKey(key);
    setShowTrialModal(false);
    setModalInputKey("");
    
    // Automatically trigger notes generation with the newly provided key
    handleGenerateNotes(key);
  };

  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJSON = () => {
    if (articles.length === 0) return;
    const blob = new Blob([JSON.stringify(articles, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pib_articles_${startDate}_to_${endDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCompleteTour = () => {
    localStorage.setItem("pib_tour_completed", "true");
    setTourStep(null);
  };

  // Helper function to render bold texts cleanly
  const parseBoldText = (text) => {
    if (!text) return "";
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-extrabold text-white text-xs">{part}</strong>;
      }
      return part;
    });
  };

  // Zero-dependency Markdown Renderer for Gemini Notes
  const renderMarkdown = (mdText) => {
    if (!mdText) return null;
    const lines = mdText.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      // Main Headers
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-xs font-black text-purple-400 mt-5 mb-2.5 tracking-wider uppercase flex items-center">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2" />
            {trimmed.substring(4)}
          </h4>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-sm font-black text-white mt-6 mb-3 border-b border-gray-900 pb-2 flex items-center">
            <ChevronRight className="w-4 h-4 mr-1 text-purple-500" />
            {trimmed.substring(3)}
          </h3>
        );
      }
      if (trimmed.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-base font-extrabold text-white mt-8 mb-4 border-l-4 border-purple-600 pl-3">
            {trimmed.substring(2)}
          </h2>
        );
      }
      
      // Lists/Bullet points
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const cleanLine = trimmed.substring(2);
        return (
          <li key={idx} className="ml-5 list-disc text-gray-305 text-xs mb-2 leading-relaxed">
            {parseBoldText(cleanLine)}
          </li>
        );
      }
      
      // Empty lines
      if (trimmed === "") {
        return <div key={idx} className="h-3" />;
      }
      
      // Standard paragraphs
      return (
        <p key={idx} className="text-xs text-gray-300 mb-2 leading-relaxed text-justify">
          {parseBoldText(line)}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 flex flex-col font-sans select-none antialiased relative">
      
      {/* Dynamic Glowing Background Effect */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="glass-card sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-blue-600 to-cyan-400 p-2 rounded-xl text-[#030712] font-black shadow-md shadow-blue-500/20">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              PIB Archive Scraper
            </h1>
            <p className="text-xs text-gray-400 font-semibold flex items-center">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
              Dual-Layer Crawler Dashboard
            </p>
          </div>
        </div>

        {/* Header Right Action Area */}
        <div className="flex items-center space-x-4">
          
          {/* Gemini API Key config */}
          <div className={`relative hidden md:flex items-center p-1 px-3 bg-gray-950/40 border rounded-2xl transition duration-300 ${tourStep === 4 ? "border-purple-500 ring-2 ring-purple-500/30 scale-105" : "border-gray-900"}`}>
            <span className="text-[10px] uppercase font-extrabold text-purple-400 tracking-wider mr-2.5 flex items-center shrink-0">
              <Cpu className="w-3.5 h-3.5 mr-1 animate-pulse" />
              Gemini key:
            </span>
            <input
              type="password"
              placeholder="Google AI Studio Key..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className="bg-transparent text-xs text-purple-300 focus:outline-none font-mono w-[160px] mr-2"
              title="Configure your custom Gemini API Key"
            />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-black text-gray-400 hover:text-white transition uppercase border-l border-gray-800 pl-2 flex items-center shrink-0 cursor-pointer"
            >
              Get Key
              <ExternalLink className="w-2.5 h-2.5 ml-1" />
            </a>
          </div>

          {articles.length > 0 && statusState === "completed" && (
            <button
              onClick={handleDownloadJSON}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-2 px-4 rounded-xl transition duration-200 shadow-md shadow-blue-500/20 transform hover:-translate-y-0.5 cursor-pointer text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Export JSON ({articles.length})</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col justify-start">
        
        {/* State: IDLE - Scraper Configuration */}
        {statusState === "idle" && (
          <div className="w-full max-w-2xl mx-auto my-12 animate-slide-in">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-white tracking-tight mb-2">
                Press Information Bureau Scraper
              </h2>
              <p className="text-gray-400 max-w-md mx-auto text-sm font-medium">
                Emulates ASP.NET callbacks and downloads government news releases in parallel.
              </p>
            </div>

            <div className={`glass-card rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden transition duration-300 ${tourStep === 1 ? "border-blue-500 ring-2 ring-blue-500/30 scale-[1.02]" : ""}`}>
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Start Date */}
                <div className="flex flex-col space-y-2">
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition duration-200 text-sm font-semibold cursor-pointer"
                  />
                </div>

                {/* End Date */}
                <div className="flex flex-col space-y-2">
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition duration-200 text-sm font-semibold cursor-pointer"
                  />
                </div>
              </div>

              {/* Workers Slider */}
              <div className="flex flex-col space-y-3 bg-gray-950/40 p-5 rounded-xl border border-gray-850">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center">
                    <Cpu className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
                    Worker Threads
                  </label>
                  <span className="text-xs font-black text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    {workers} Threads (Parallel)
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={workers}
                  onChange={(e) => setWorkers(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <p className="text-[10px] text-gray-500 font-semibold">
                  Tuning this parameter controls how many articles fetch concurrently. 10 is ideal for most scenarios.
                </p>
              </div>

              {/* Mobile API Key input */}
              <div className="flex flex-col space-y-2 md:hidden bg-gray-950/40 p-4 rounded-xl border border-gray-850">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center">
                  <Cpu className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
                  Gemini API Key
                </label>
                <div className="flex space-x-2">
                  <input
                    type="password"
                    placeholder="Enter Gemini API Key..."
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition duration-200 font-mono flex-1"
                  />
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-900 border border-gray-850 hover:bg-gray-800 p-2.5 px-4 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition flex items-center shrink-0"
                  >
                    Get Key
                  </a>
                </div>
              </div>

              {/* Trigger Button */}
              <button
                onClick={handleStartScrape}
                className="w-full flex items-center justify-center space-x-2.5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:via-blue-400 hover:to-cyan-400 text-white font-extrabold py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transform hover:-translate-y-0.5 cursor-pointer text-base"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Initialize Scraper Engine</span>
              </button>
            </div>
          </div>
        )}

        {/* State: SCRAPING - Dynamic Logs Terminal Console */}
        {statusState === "scraping" && (
          <div className="w-full max-w-4xl mx-auto my-6 animate-slide-in flex flex-col space-y-6 flex-1">
            
            {/* Live Progress Bar Widget */}
            <div className={`glass-card rounded-2xl p-6 shadow-2xl space-y-4 transition duration-300 ${tourStep === 2 ? "border-blue-500 ring-2 ring-blue-500/30 scale-[1.01]" : ""}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-extrabold text-white text-base">Running PIB Crawler Pipeline</h3>
                  <p className="text-xs text-gray-400 font-semibold mt-0.5">{currentStepText}</p>
                </div>
                {progressPercent > 0 && (
                  <span className="text-sm font-black text-blue-400">{progressPercent}%</span>
                )}
              </div>
              
              {/* Progress Slider Track */}
              <div className="w-full h-2.5 bg-gray-950 rounded-full overflow-hidden border border-gray-900">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent || 2}%` }}
                />
              </div>

              {/* Real-time stats display */}
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="bg-gray-950/40 border border-gray-900 rounded-xl p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Discovered</span>
                  <div className="text-xl font-black text-blue-400 mt-0.5">{discoveredCount}</div>
                </div>
                <div className="bg-gray-950/40 border border-gray-900 rounded-xl p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Downloaded</span>
                  <div className="text-xl font-black text-cyan-400 mt-0.5">{downloadCount}</div>
                </div>
                <div className="bg-gray-950/40 border border-gray-900 rounded-xl p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500">Concurrency</span>
                  <div className="text-xl font-black text-purple-400 mt-0.5">{workers}</div>
                </div>
              </div>

              {latestTitle && (
                <div className="text-xs text-gray-400 font-medium truncate pt-1 flex items-center">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full mr-2 animate-ping shrink-0" />
                  <span className="font-bold text-gray-300 mr-1.5 shrink-0">Latest:</span>
                  <span className="truncate italic">"{latestTitle}"</span>
                </div>
              )}
            </div>

            {/* Terminal Window */}
            <div className="glass-card rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl border border-gray-850">
              {/* Terminal Window Header Bar */}
              <div className="bg-gray-950 px-5 py-3.5 flex items-center justify-between border-b border-gray-900">
                <div className="flex items-center space-x-2.5">
                  <TerminalIcon className="w-4 h-4 text-gray-500" />
                  <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    SYSTEM LOGGER CONSOLE
                  </span>
                </div>
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 bg-red-500/20 rounded-full" />
                  <div className="w-2.5 h-2.5 bg-yellow-500/20 rounded-full" />
                  <div className="w-2.5 h-2.5 bg-green-500/20 rounded-full" />
                </div>
              </div>

              {/* Logs Display Screen */}
              <div className="flex-1 bg-black/85 p-6 overflow-y-auto font-mono text-xs space-y-2.5 min-h-[300px] max-h-[450px]">
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start space-x-3.5">
                    <span className="text-gray-600 select-none shrink-0 font-semibold">[{log.time}]</span>
                    <span className={`
                      flex-1 whitespace-pre-wrap leading-relaxed
                      ${log.type === "error" ? "text-red-400 font-bold" : ""}
                      ${log.type === "success" ? "text-emerald-400 font-bold" : ""}
                      ${log.type === "warning" ? "text-yellow-400" : ""}
                      ${log.type === "system" ? "text-purple-400 font-medium" : ""}
                      ${log.type === "progress" ? "text-cyan-400/80" : ""}
                      ${log.type === "info" ? "text-gray-300" : ""}
                    `}>
                      {log.text}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        )}

        {/* State: ERROR & EMPTY - Fallback widgets */}
        {(statusState === "error" || statusState === "empty") && (
          <div className="w-full max-w-md mx-auto my-12 animate-slide-in text-center">
            <div className="glass-card rounded-2xl p-8 shadow-2xl relative overflow-hidden space-y-6">
              <div className={`absolute top-0 left-0 w-full h-[3px] ${statusState === "error" ? "bg-red-500" : "bg-yellow-500"}`} />
              
              <div className="flex justify-center">
                <div className={`p-4 rounded-full ${statusState === "error" ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"}`}>
                  {statusState === "error" ? <RefreshCw className="w-10 h-10 animate-spin" /> : <Calendar className="w-10 h-10" />}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-white">
                  {statusState === "error" ? "Crawler Execution Failed" : "No Press Releases Found"}
                </h3>
                <p className="text-sm text-gray-400 mt-2 font-semibold">
                  {statusState === "error" 
                    ? `Verify the FastAPI server is running at ${API_BASE_URL} and the dates are formatted correctly.` 
                    : "No announcements were discovered in the selected range. Try querying a different set of dates."}
                </p>
              </div>

              <button
                onClick={() => setStatusState("idle")}
                className="w-full flex items-center justify-center space-x-2 bg-gray-900 border border-gray-800 hover:bg-gray-850 hover:border-gray-750 text-white font-bold py-3 px-4 rounded-xl transition duration-200 cursor-pointer text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Adjust Parameters & Retry</span>
              </button>
            </div>
          </div>
        )}

        {/* State: COMPLETED - Searchable Dashboard Grid */}
        {statusState === "completed" && (
          <div className="w-full animate-slide-in flex flex-col space-y-6">
            
            {/* Filter Hub Card */}
            <div className="glass-card rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Filters left */}
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-1">
                {/* Search Bar */}
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search keywords or IDs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-950/60 border border-gray-900 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition duration-200 font-semibold"
                  />
                </div>

                {/* Ministry selector */}
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-xs uppercase font-extrabold text-gray-400 tracking-wider">
                    Ministry:
                  </span>
                  <select
                    value={selectedMinistry}
                    onChange={(e) => setSelectedMinistry(e.target.value)}
                    className="bg-gray-950/60 border border-gray-900 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition duration-200 font-bold cursor-pointer max-w-[200px]"
                  >
                    {ministries.map(min => (
                      <option key={min} value={min}>{min}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Stats Summary */}
              <div className="flex items-center space-x-4 shrink-0 bg-gray-950/40 p-2 px-4 rounded-xl border border-gray-900">
                <div className="text-center border-r border-gray-850 pr-4">
                  <div className="text-xs font-black text-blue-400">{filteredArticles.length}</div>
                  <span className="text-[9px] uppercase font-bold text-gray-500">Filtered</span>
                </div>
                <div className="text-center pr-1">
                  <div className="text-xs font-black text-gray-300">{articles.length}</div>
                  <span className="text-[9px] uppercase font-bold text-gray-500">Total Scraped</span>
                </div>
                <button
                  onClick={() => setStatusState("idle")}
                  className="bg-gray-900 hover:bg-gray-850 p-2 rounded-lg border border-gray-800 text-gray-400 hover:text-white transition cursor-pointer"
                  title="Run New Scrape"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

            {/* Dashboard Display Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Left List Card */}
              <div className="lg:col-span-1 glass-card rounded-2xl flex flex-col overflow-hidden max-h-[600px] border border-gray-850 shadow-2xl">
                <div className="bg-gray-950 px-5 py-3 border-b border-gray-900 flex items-center justify-between">
                  <h3 className="text-xs uppercase font-extrabold text-gray-400 tracking-wider">
                    Scraped Press Releases
                  </h3>
                  <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                    {filteredArticles.length} matching
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-gray-900 max-h-[550px]">
                  {filteredArticles.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 text-xs font-bold">
                      No matching releases found.
                    </div>
                  ) : (
                    filteredArticles.map(art => {
                      const isActive = activeArticle?.article_id === art.article_id;
                      return (
                        <div
                          key={art.article_id}
                          onClick={() => {
                            setActiveArticle(art);
                            setCopied(false);
                          }}
                          className={`p-4 transition duration-200 cursor-pointer relative ${isActive ? "bg-blue-600/10 border-l-[3px] border-blue-500 animate-pulse" : "hover:bg-gray-900/30 border-l-[3px] border-transparent"}`}
                        >
                          <div className="flex justify-between items-start space-x-2">
                            <span className="text-[10px] font-black text-gray-400 font-mono">
                              ID: {art.article_id}
                            </span>
                            <span className="text-[9px] font-bold text-gray-500 flex items-center shrink-0">
                              <Clock className="w-2.5 h-2.5 mr-1" />
                              {art.date}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-white mt-1.5 leading-relaxed line-clamp-2">
                            {art.title}
                          </h4>
                          <div className="flex items-center justify-between mt-2.5">
                            <span className="text-[9px] font-black text-blue-400 bg-blue-500/5 px-2 py-0.5 rounded border border-blue-500/10 max-w-[170px] truncate">
                              {art.ministry}
                            </span>
                            <ChevronRight className={`w-3.5 h-3.5 text-gray-600 transition-transform ${isActive ? "translate-x-0.5 text-blue-400" : ""}`} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right content viewpane */}
              <div className={`lg:col-span-2 glass-card rounded-2xl p-6 min-h-[500px] max-h-[600px] overflow-y-auto flex flex-col border shadow-2xl transition duration-300 ${tourStep === 3 ? "border-purple-500 ring-2 ring-purple-500/30 scale-[1.01]" : "border-gray-850"}`}>
                {activeArticle ? (
                  <div className="flex-1 flex flex-col animate-slide-in">
                    
                    {/* Header meta card */}
                    <div className="pb-5 border-b border-gray-900 space-y-3.5">
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-xl border border-blue-500/15">
                          {activeArticle.ministry}
                        </span>
                        
                        <div className="flex items-center space-x-2">
                          {/* Copy content */}
                          <button
                            onClick={() => handleCopyText(activeTab === "notes" ? activeArticle.notes : activeArticle.content_text)}
                            className="flex items-center space-x-1.5 bg-gray-900 border border-gray-850 hover:bg-gray-800 p-1.5 px-3 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                          >
                            {copied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy {activeTab === "notes" ? "Notes" : "Text"}</span>
                              </>
                            )}
                          </button>

                          {/* Open Source */}
                          <a
                            href={activeArticle.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1.5 bg-gray-900 border border-gray-855 hover:bg-gray-805 p-1.5 px-3 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Source Link</span>
                          </a>
                        </div>
                      </div>

                      <h2 className="text-lg font-black text-white leading-snug">
                        {activeArticle.title}
                      </h2>

                      <div className="text-[10px] text-gray-500 font-bold flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0">
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1 text-gray-600" />
                          {activeArticle.datetime}
                        </span>
                        <span className="hidden sm:inline text-gray-700">|</span>
                        <span className="font-mono text-gray-500">
                          Release ID: {activeArticle.article_id}
                        </span>
                      </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex border-b border-gray-900 mt-4">
                      <button
                        onClick={() => setActiveTab("article")}
                        className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold transition border-b-2 cursor-pointer ${activeTab === "article" ? "border-blue-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Raw Release</span>
                      </button>
                      <button
                        onClick={() => setActiveTab("notes")}
                        className={`flex items-center space-x-2 py-2.5 px-4 text-xs font-bold transition border-b-2 cursor-pointer ${activeTab === "notes" ? "border-purple-500 text-purple-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}
                      >
                        <Cpu className="w-3.5 h-3.5" />
                        <span>AI Study Notes</span>
                        {trialUsedArticles.length === 0 && !geminiApiKey && (
                          <span className="bg-purple-500 text-[#030712] font-black text-[8px] px-1.5 py-0.5 rounded-full shrink-0 animate-bounce">
                            Free Trial
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Tab Content: Article Body Content (Trim Bug Fixed) */}
                    {activeTab === "article" && (
                      <div className="flex-1 pt-6 text-sm text-gray-300 leading-relaxed overflow-y-auto space-y-4 pr-1 font-medium select-text">
                        {activeArticle.content_text.split('\n\n').map((paragraph, index) => {
                          const text = paragraph.trim();
                          if (!text) return null;
                          return (
                            <p key={index} className="text-justify font-normal text-gray-300">
                              {text}
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {/* Tab Content: AI Study Notes */}
                    {activeTab === "notes" && (
                      <div className="flex-1 pt-6 overflow-y-auto flex flex-col pr-1 select-text">
                        {activeArticle.notes ? (
                          <div className="space-y-1 animate-slide-in pb-6">
                            {renderMarkdown(activeArticle.notes)}
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-5 animate-slide-in">
                            <div className="p-4 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-md">
                              <Cpu className={`w-8 h-8 ${isGeneratingNotes ? "animate-spin animate-pulse" : ""}`} />
                            </div>
                            
                            <div className="space-y-2">
                              <h4 className="font-extrabold text-white text-base flex items-center justify-center">
                                <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
                                Generate AI First-Principle Notes
                              </h4>
                              <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1 font-semibold leading-relaxed">
                                Let Gemini analyze this press release, extract target keywords, and explain them from absolute first principles to advanced concepts.
                              </p>
                            </div>

                            {noteGenerationError && (
                              <p className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl max-w-xs mx-auto">
                                {noteGenerationError}
                              </p>
                            )}

                            <button
                              onClick={() => handleGenerateNotes()}
                              disabled={isGeneratingNotes}
                              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold py-2.5 px-6 rounded-xl transition duration-200 shadow-md shadow-purple-500/15 disabled:opacity-50 cursor-pointer text-xs flex items-center space-x-2 transform hover:-translate-y-0.5"
                            >
                              {isGeneratingNotes ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>AI is Analyzing Content...</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Generate Notes {geminiApiKey ? "" : "(Free Trial)"}</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
                    <div className="p-4 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-md">
                      <BookOpen className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-white text-base">Select an Announcement</h4>
                      <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1 font-semibold">
                        Choose a press release from the catalog column on the left to read its full cleaned body text here.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </main>

      {/* State: FREE TRIAL EXHAUSTED MODAL */}
      {showTrialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden space-y-6 animate-slide-in">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-purple-500 to-indigo-500" />
            
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Lock className="w-10 h-10" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-extrabold text-white">Free Trial Limit Reached!</h3>
              <p className="text-xs text-gray-400 font-semibold leading-relaxed">
                You have exhausted your **1 free trial article** notes generation using our trial key! To continue unlocking unlimited, detailed first-principle research notes, please configure your own Gemini API Key.
              </p>
              <p className="text-[10px] text-purple-400/90 font-bold bg-purple-500/5 py-1 px-3 rounded-lg inline-block border border-purple-500/10">
                Getting a personal key is 100% Free & takes 10 seconds!
              </p>
            </div>

            {/* AI Studio Link button */}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold py-3 px-4 rounded-xl transition duration-200 shadow-md shadow-purple-500/15 cursor-pointer text-sm transform hover:-translate-y-0.5"
            >
              <span>Get Your Free Gemini API Key</span>
              <ExternalLink className="w-4 h-4" />
            </a>

            {/* Input key inside modal for smooth fast flow */}
            <div className="space-y-2 pt-2 border-t border-gray-900">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                Enter API Key to Unlock:
              </label>
              <div className="flex space-x-2">
                <input
                  type="password"
                  placeholder="Paste AI Studio key..."
                  value={modalInputKey}
                  onChange={(e) => setModalInputKey(e.target.value)}
                  className="bg-gray-950/60 border border-gray-900 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition duration-200 font-mono flex-1"
                />
                <button
                  onClick={handleUnlockUnlimited}
                  className="bg-gray-900 hover:bg-gray-850 p-2.5 px-4 rounded-xl text-xs font-bold text-emerald-400 hover:text-emerald-300 transition shrink-0 border border-gray-800 cursor-pointer"
                >
                  Unlock
                </button>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowTrialModal(false)}
              className="w-full py-2.5 text-center text-xs font-bold text-gray-500 hover:text-gray-400 transition cursor-pointer"
            >
              Cancel & Back to Article
            </button>

          </div>
        </div>
      )}

      {/* State: ONBOARDING PLATFORM WELCOME TOUR OVERLAY */}
      {tourStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-fade-in">
          <div className="glass-card rounded-2xl p-7 max-w-md w-full shadow-2xl relative overflow-hidden space-y-6 animate-slide-in">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500" />
            
            {/* Tour step index */}
            <div className="flex justify-between items-center">
              <span className="text-[9px] uppercase font-black text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                Platform Tour: Step {tourStep} of 4
              </span>
              <button 
                onClick={handleCompleteTour}
                className="text-xs font-bold text-gray-500 hover:text-gray-400 transition cursor-pointer"
              >
                Skip Tour
              </button>
            </div>

            {/* Onboarding text content */}
            <div className="space-y-3">
              {tourStep === 1 && (
                <>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl w-fit">
                    <Calendar className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-black text-white">📅 Set Search Parameters</h3>
                  <p className="text-xs text-gray-400 leading-relaxed font-semibold">
                    Set your Start Date and End Date range. You can also slide the **Worker Threads** bar to increase parallel download speeds. Our custom **day-by-day crawler** scans each date independently, fully bypassing government server truncation limits to guarantee 100% data discovery!
                  </p>
                </>
              )}
              {tourStep === 2 && (
                <>
                  <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl w-fit">
                    <TerminalIcon className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-black text-white">📺 Monitor Live Telemetry</h3>
                  <p className="text-xs text-gray-400 leading-relaxed font-semibold">
                    When you launch the crawler, a live logging terminal drops down. Watch indices paginate and multiple threads download announcement bodies concurrently. Progress bars and active counts track download metrics in real-time.
                  </p>
                </>
              )}
              {tourStep === 3 && (
                <>
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl w-fit">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-black text-white">🧠 Generate AI Study Notes</h3>
                  <p className="text-xs text-gray-400 leading-relaxed font-semibold">
                    Once scraped, explore your articles using search queries and ministry filters. Click any release card to view the raw text. Then, toggle to the **AI Study Notes** tab! Gemini will extract target keywords and build detailed study notes explaining them from first principles!
                  </p>
                </>
              )}
              {tourStep === 4 && (
                <>
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl w-fit">
                    <Lock className="w-7 h-7 animate-bounce" />
                  </div>
                  <h3 className="text-lg font-black text-white">🔑 Bring Your Own Key (BYOK)</h3>
                  <p className="text-xs text-gray-400 leading-relaxed font-semibold">
                    We provide a **1-article Free Trial** out-of-the-box using our pre-configured key! For unlimited study notes, enter your own Gemini API Key inside the header key manager. Keys are 100% Free and take 10 seconds to generate from Google AI Studio.
                  </p>
                </>
              )}
            </div>

            {/* Onboarding buttons */}
            <div className="flex justify-between items-center pt-2.5 border-t border-gray-900">
              {tourStep > 1 ? (
                <button
                  onClick={() => setTourStep(prev => prev - 1)}
                  className="bg-gray-900 hover:bg-gray-850 p-2.5 px-4 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer flex items-center space-x-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}
              
              <button
                onClick={() => {
                  if (tourStep === 4) {
                    handleCompleteTour();
                  } else {
                    setTourStep(prev => prev + 1);
                  }
                }}
                className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-extrabold py-2.5 px-5 rounded-xl transition duration-200 cursor-pointer text-xs flex items-center space-x-1.5 transform hover:-translate-y-0.5"
              >
                <span>{tourStep === 4 ? "Get Started" : "Next"}</span>
                {tourStep === 4 ? <CheckCircle className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer bar */}
      <footer className="glass-card mt-auto border-t border-gray-900 py-3.5 px-6 flex flex-col sm:flex-row items-center justify-between text-[10px] font-bold text-gray-500 tracking-wider">
        <span>PRESS INFORMATION BUREAU ARCHIVE CRAWLER SYSTEM &bull; 2026</span>
        <button
          onClick={() => setTourStep(1)}
          className="mt-2 sm:mt-0 flex items-center space-x-1 hover:text-purple-400 transition cursor-pointer text-[9px] uppercase font-black"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Platform Onboarding Tour</span>
        </button>
      </footer>

    </div>
  );
}

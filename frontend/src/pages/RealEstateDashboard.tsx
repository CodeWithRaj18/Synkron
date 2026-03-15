import 'leaflet/dist/leaflet.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';

import { AIPipelineFlow } from '../components/ai/AIPipelineFlow';
import { UploadPanel } from '../components/UploadPanel';
import { recommendRealEstate, uploadDatasets } from '../services/api';
import {
  ParsedDataset,
  RealEstateHardInputFilters,
  RealEstateRecommendationResponse,
  RecommendedPlace,
} from '../types/types';

const REAL_ESTATE_RECOMMENDATION_KEY = 'real_estate_recommendation_report';
const REAL_ESTATE_SELECTION_KEY = 'real_estate_selected_places';

function formatInr(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function RealEstateDashboard() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [datasets, setDatasets] = useState<ParsedDataset[]>([]);
  const [recommendation, setRecommendation] = useState<RealEstateRecommendationResponse | null>(null);

  const [locationInput, setLocationInput] = useState('');
  const [bhkInput, setBhkInput] = useState('2,3');
  const [budgetMinInput, setBudgetMinInput] = useState('8000000');
  const [budgetMaxInput, setBudgetMaxInput] = useState('12000000');
  const [requireRera, setRequireRera] = useState(true);
  const [requireApartment, setRequireApartment] = useState(true);
  const [requireReadyToMove, setRequireReadyToMove] = useState(false);
  const [minDomainScoreInput, setMinDomainScoreInput] = useState('');

  const [selectedPlaceKeys, setSelectedPlaceKeys] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const canRecommend = useMemo(() => !isRecommending, [isRecommending]);

  const selectedPlaces = useMemo(() => {
    const all = recommendation?.recommendations ?? [];
    const keySet = new Set(selectedPlaceKeys);
    return all.filter((place) => keySet.has(`${place.project_name}::${place.latitude}::${place.longitude}`));
  }, [recommendation, selectedPlaceKeys]);

  useEffect(() => {
    try {
      const rawRecommendation = localStorage.getItem(REAL_ESTATE_RECOMMENDATION_KEY);
      if (rawRecommendation) {
        const parsed = JSON.parse(rawRecommendation) as RealEstateRecommendationResponse;
        if (parsed && Array.isArray(parsed.recommendations)) {
          setRecommendation(parsed);
        }
      }

      const rawSelections = localStorage.getItem(REAL_ESTATE_SELECTION_KEY);
      if (rawSelections) {
        const parsed = JSON.parse(rawSelections);
        if (Array.isArray(parsed)) {
          setSelectedPlaceKeys(parsed.filter((item) => typeof item === 'string'));
        }
      }
    } catch {
      // Ignore malformed cache entries.
    }
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current).setView([17.4448, 78.3915], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!markerLayerRef.current || !mapRef.current) {
      return;
    }

    markerLayerRef.current.clearLayers();
    const places = recommendation?.recommendations ?? [];
    if (places.length === 0) {
      return;
    }

    const latLngs: L.LatLngTuple[] = [];
    places.forEach((place, index) => {
      const key = `${place.project_name}::${place.latitude}::${place.longitude}`;
      const isSelected = selectedPlaceKeys.includes(key);
      const marker = L.circleMarker([place.latitude, place.longitude], {
        radius: isSelected ? 10 : 8,
        color: isSelected ? '#065f46' : '#1d4ed8',
        fillColor: isSelected ? '#10b981' : '#3b82f6',
        fillOpacity: 0.9,
        weight: 2,
      }).bindPopup(
        `<b>${index + 1}. ${place.project_name}</b><br/>${place.location}<br/>${formatInr(place.price_inr)}<br/>${place.bhk || 'BHK N/A'}`,
      );

      markerLayerRef.current?.addLayer(marker);
      latLngs.push([place.latitude, place.longitude]);
    });

    if (latLngs.length > 0) {
      mapRef.current.fitBounds(latLngs, { padding: [30, 30] });
    }
  }, [recommendation, selectedPlaceKeys]);

  useEffect(() => {
    localStorage.setItem(REAL_ESTATE_SELECTION_KEY, JSON.stringify(selectedPlaceKeys));
  }, [selectedPlaceKeys]);

  const handleUpload = async () => {
    setError(null);
    setIsUploading(true);

    try {
      const response = await uploadDatasets(selectedFiles);
      setDatasets((previous) => [...previous, ...response.datasets]);
      setSelectedFiles([]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRecommend = async () => {
    setError(null);
    setIsRecommending(true);

    try {
      const preferredLocations = locationInput
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const bhkValues = bhkInput
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);

      const payload: RealEstateHardInputFilters & { extracted_data: Record<string, unknown> } = {
        preferred_locations: preferredLocations,
        bhk_values: bhkValues,
        require_rera: requireRera,
        require_apartment: requireApartment,
        require_ready_to_move: requireReadyToMove,
        extracted_data: {
          project_name: 'Real Estate Development',
          datasets,
        },
      };

      const budgetMin = Number(budgetMinInput.trim());
      if (Number.isFinite(budgetMin)) {
        payload.budget_min = budgetMin;
      }

      const budgetMax = Number(budgetMaxInput.trim());
      if (Number.isFinite(budgetMax)) {
        payload.budget_max = budgetMax;
      }

      const minDomain = Number(minDomainScoreInput.trim());
      if (Number.isFinite(minDomain)) {
        payload.min_listing_domain_score = minDomain;
      }

      const response = await recommendRealEstate(payload);
      setRecommendation(response);
      localStorage.setItem(REAL_ESTATE_RECOMMENDATION_KEY, JSON.stringify(response));
      setSelectedPlaceKeys([]);
    } catch (recommendationError) {
      setError(recommendationError instanceof Error ? recommendationError.message : 'Recommendation failed');
    } finally {
      setIsRecommending(false);
    }
  };

  const toggleSelectedPlace = (place: RecommendedPlace, checked: boolean) => {
    const key = `${place.project_name}::${place.latitude}::${place.longitude}`;
    if (checked) {
      setSelectedPlaceKeys((previous) => [...previous, key]);
      return;
    }
    setSelectedPlaceKeys((previous) => previous.filter((item) => item !== key));
  };

  const handleExportPdf = () => {
    if (selectedPlaces.length === 0) {
      return;
    }

    const rows = selectedPlaces
      .map(
        (place, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${place.project_name}</td>
            <td>${place.location}</td>
            <td>${place.bhk || 'N/A'}</td>
            <td>${formatInr(place.price_inr)}</td>
            <td>${place.rera_approved === true ? 'Yes' : place.rera_approved === false ? 'No' : 'N/A'}</td>
            <td>${place.possession_months ?? 'N/A'}</td>
            <td>${place.reason}</td>
          </tr>
        `,
      )
      .join('');

    const printable = `
      <html>
        <head>
          <title>Real Estate Recommendation Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin-bottom: 4px; }
            p { margin-top: 0; color: #334155; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; font-size: 12px; }
            th { background: #e2e8f0; text-align: left; }
          </style>
        </head>
        <body>
          <h1>Residential Recommendation Report</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
          <p><strong>Filters:</strong> Locations=${locationInput}; BHK=${bhkInput}; Budget=${budgetMinInput}-${budgetMaxInput}; RERA=${requireRera ? 'Yes' : 'No'}; Apartment=${requireApartment ? 'Yes' : 'No'}; ReadyToMove=${requireReadyToMove ? 'Yes' : 'No'}</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Project</th>
                <th>Location</th>
                <th>BHK</th>
                <th>Price</th>
                <th>RERA</th>
                <th>Possession (months)</th>
                <th>Why Recommended</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const reportWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!reportWindow) {
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(printable);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">REAL ESTATE AGENT</p>
            <h1 className="text-2xl font-semibold text-slate-100">Hard Input Matching + Map + PDF</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            aria-label="Back to landing page"
            className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition duration-200 ease-in-out hover:bg-slate-700"
          >
            Back
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8">
        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          whileHover={{ scale: 1.02 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10"
        >
          <AIPipelineFlow pipelineType="realestate" />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.02 }}
          whileHover={{ scale: 1.02 }}
        >
          <UploadPanel
            selectedFiles={selectedFiles}
            onFilesChange={setSelectedFiles}
            onUpload={handleUpload}
            isUploading={isUploading}
            onClear={() => setSelectedFiles([])}
            variant="dark"
          />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.04 }}
          whileHover={{ scale: 1.02 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10"
        >
          <h2 className="text-lg font-semibold text-slate-100">Property Requirement Inputs</h2>
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Preferred Locations (comma separated)
              <input
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="Enter preferred locations"
                aria-label="Preferred locations"
              />
            </label>
            <label className="text-sm text-slate-300">
              BHK Values (comma separated)
              <input
                value={bhkInput}
                onChange={(event) => setBhkInput(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="2,3"
                aria-label="BHK values"
              />
            </label>
            <label className="text-sm text-slate-300">
              Budget Min (INR)
              <input
                value={budgetMinInput}
                onChange={(event) => setBudgetMinInput(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="8000000"
                aria-label="Minimum budget in INR"
              />
            </label>
            <label className="text-sm text-slate-300">
              Budget Max (INR)
              <input
                value={budgetMaxInput}
                onChange={(event) => setBudgetMaxInput(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="12000000"
                aria-label="Maximum budget in INR"
              />
            </label>
            <label className="text-sm text-slate-300">
              Minimum Listing Domain Score (optional)
              <input
                value={minDomainScoreInput}
                onChange={(event) => setMinDomainScoreInput(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                placeholder="0.6"
                aria-label="Minimum listing domain score"
              />
            </label>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={requireRera} onChange={(event) => setRequireRera(event.target.checked)} />
                Require RERA
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={requireApartment} onChange={(event) => setRequireApartment(event.target.checked)} />
                Require Apartment
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={requireReadyToMove} onChange={(event) => setRequireReadyToMove(event.target.checked)} />
                Require Ready To Move
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRecommend}
              disabled={!canRecommend}
              aria-label="Find matching real estate places"
              className="inline-flex items-center rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition duration-200 ease-in-out hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-600"
            >
              {isRecommending ? 'Finding Matching Places...' : 'Find Matching Places'}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={selectedPlaces.length === 0}
              aria-label="Export selected recommendations to PDF"
              className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-200 transition duration-200 ease-in-out hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export Selected to PDF
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Recommendations use the fixed backend CSV dataset by default. Upload is optional.
          </p>
        </motion.section>

        {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">{error}</p>}

        <motion.section
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="grid grid-cols-1 gap-8 lg:grid-cols-3"
        >
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10">
            <h3 className="text-base font-semibold text-slate-100">Recommended Places (Top 5)</h3>
            {!recommendation || recommendation.recommendations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No recommendations yet. Click Find Matching Places.</p>
            ) : (
              <ul className="mt-3 space-y-2" aria-live="polite" aria-label="Real estate recommendation results">
                {recommendation.recommendations.map((place, index) => {
                  const key = `${place.project_name}::${place.latitude}::${place.longitude}`;
                  const checked = selectedPlaceKeys.includes(key);

                  return (
                    <motion.li
                      whileHover={{ scale: 1.01 }}
                      key={key}
                      className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition-all duration-200 hover:border-cyan-400"
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleSelectedPlace(place, event.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                        />
                        <div className="w-full text-sm">
                          <p className="font-semibold text-slate-100">{index + 1}. {place.project_name}</p>
                          <p className="text-slate-300">{place.location}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {place.bhk || 'BHK N/A'} | {formatInr(place.price_inr)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Lat/Lng: {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">{place.reason}</p>
                          <p className="mt-1 text-xs text-slate-200">{checked ? '✔ Selected for export' : '○ Not selected'}</p>
                        </div>
                      </label>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10">
            <h3 className="text-base font-semibold text-slate-100">Map View</h3>
            <div className="mt-3 h-[420px] overflow-hidden rounded-xl border border-slate-700">
              <div ref={mapContainerRef} className="h-full w-full" />
            </div>
          </div>
        </motion.section>
      </main>

    </div>
  );
}

// Leaflet map — OpenStreetMap data, Carto Voyager tiles (English labels)
// Routing via OSRM public server (actual driving routes, free)

import React, {
  useRef, useEffect, forwardRef, useImperativeHandle,
} from 'react';
import { MAP_DEFAULTS, TILE_URL, TILE_ATTRIBUTION } from '../config/maps';

// Unique ID per map instance to filter postMessage events
let _idCounter = 0;

const buildHTML = (mapId, lat, lng, zoom) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  #map{width:100%;height:100vh}
  .lm{width:30px;height:30px;border-radius:50%;border:3px solid #fff;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:11px;font-weight:bold;
      box-shadow:0 2px 8px rgba(0,0,0,.35);line-height:1;cursor:pointer}
</style>
</head>
<body>
<div id="map"></div>
<script>
var MAP_ID='${mapId}';
var COLORS={pickup:'#22C55E',dest:'#C2185B',driver:'#1A1A2E',me:'#3B82F6',default:'#6B7280'};
var LABELS={pickup:'P',dest:'D',driver:'\\u25B2',me:'\\u25CF',default:'\\u00B7'};

var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],${zoom});
L.tileLayer('${TILE_URL}',{
  attribution:'${TILE_ATTRIBUTION}',
  subdomains:'abcd',maxZoom:20
}).addTo(map);

var markers={};
var routeLayer=null;

function makeIcon(type){
  var c=COLORS[type]||COLORS.default;
  var l=LABELS[type]||LABELS.default;
  var html='<div class="lm" style="background:'+c+'">'+l+'</div>';
  return L.divIcon({html:html,className:'',iconSize:[30,30],iconAnchor:[15,15]});
}

window.addEventListener('message',function(e){
  var m=e.data;
  if(!m||m.mapId!==MAP_ID)return;
  switch(m.type){
    case 'SET_MARKER':
      if(markers[m.id])markers[m.id].remove();
      markers[m.id]=L.marker([m.lat,m.lng],{icon:makeIcon(m.markerType)});
      if(m.label)markers[m.id].bindPopup(m.label);
      markers[m.id].addTo(map);
      break;
    case 'REMOVE_MARKER':
      if(markers[m.id]){markers[m.id].remove();delete markers[m.id];}
      break;
    case 'DRAW_ROUTE':
      if(routeLayer){routeLayer.remove();routeLayer=null;}
      if(m.geometry){
        routeLayer=L.geoJSON(m.geometry,{
          style:{color:'#C2185B',weight:5,opacity:.85,lineJoin:'round',lineCap:'round'}
        }).addTo(map);
      }
      break;
    case 'CLEAR_ROUTE':
      if(routeLayer){routeLayer.remove();routeLayer=null;}
      break;
    case 'SET_VIEW':
      map.setView([m.lat,m.lng],m.zoom!==undefined?m.zoom:map.getZoom());
      break;
    case 'FIT':
      var pts=Object.values(markers).map(function(mk){return mk.getLatLng();});
      if(m.extra)m.extra.forEach(function(p){pts.push(L.latLng(p[0],p[1]));});
      if(pts.length){var b=L.latLngBounds(pts);if(b.isValid())map.fitBounds(b,{padding:[60,60]});}
      break;
  }
});

map.on('click',function(e){
  parent.postMessage({mapId:MAP_ID,type:'CLICK',lat:e.latlng.lat,lng:e.latlng.lng},'*');
});
</script>
</body>
</html>`;

const LeafletMap = forwardRef(({
  center   = MAP_DEFAULTS.center,
  zoom     = MAP_DEFAULTS.zoom,
  onMapClick,
  height   = 240,
  style    = {},
}, ref) => {
  const iframeRef    = useRef(null);
  const mapId        = useRef(`m${++_idCounter}`).current;
  const onClickRef   = useRef(onMapClick);
  const srcRef       = useRef(null);

  onClickRef.current = onMapClick;

  if (!srcRef.current) {
    const html = buildHTML(mapId, center.lat, center.lng, zoom);
    srcRef.current = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }

  const send = (msg) => {
    iframeRef.current?.contentWindow?.postMessage({ ...msg, mapId }, '*');
  };

  // Listen for clicks from the iframe
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.mapId !== mapId || e.data?.type !== 'CLICK') return;
      onClickRef.current?.(e.data.lat, e.data.lng);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [mapId]);

  useImperativeHandle(ref, () => ({
    setMarker(id, lat, lng, type, label) {
      send({ type: 'SET_MARKER', id, lat, lng, markerType: type, label });
    },

    removeMarker(id) {
      send({ type: 'REMOVE_MARKER', id });
    },

    async showRoute(fromLat, fromLng, toLat, toLng, onResult) {
      try {
        const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
          { headers: { 'User-Agent': 'SheDriveApp/1.0' } }
        );
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes?.length) return;
        const route = data.routes[0];
        send({ type: 'DRAW_ROUTE', geometry: route.geometry });
        onResult?.({
          distanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMins: Math.ceil(route.duration / 60),
        });
      } catch (err) {
        console.warn('OSRM route error:', err);
      }
    },

    clearRoute() { send({ type: 'CLEAR_ROUTE' }); },

    setView(lat, lng, z) { send({ type: 'SET_VIEW', lat, lng, zoom: z }); },

    fit(extra) { send({ type: 'FIT', extra }); },

    // Legacy stubs
    drawLine() {},
    clearLine() {},
  }), []);

  return (
    <div style={{ height, borderRadius: 16, overflow: 'hidden', ...style }}>
      <iframe
        ref={iframeRef}
        src={srcRef.current}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="map"
      />
    </div>
  );
});

export default LeafletMap;

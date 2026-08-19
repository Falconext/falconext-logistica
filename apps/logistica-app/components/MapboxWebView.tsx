import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { Env } from '../constants/Env';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

// NOTA: el componente conserva el nombre `MapboxWebView` y su interfaz de props por
// compatibilidad con las pantallas que ya lo importan, pero por dentro ahora usa
// **Google Maps JS API** (no Mapbox) dentro de un WebView.

type Preset = 'day' | 'night';

export interface MapMarker {
  lng: number;
  lat: number;
  color?: string;
  popup?: string;
}
export interface MapCircle {
  lng: number;
  lat: number;
  radius: number; // metros
  color?: string;
}
export interface MapRoute {
  originAddress?: string;
  destinationAddress?: string;
  waypoints?: string[]; // paradas intermedias (en orden) entre origen y destino
  coordinates?: [number, number][];
}

export interface MapboxWebViewProps {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  mapStyle?: 'dark' | 'satellite' | 'streets';
  markers?: MapMarker[];
  circles?: MapCircle[];
  route?: MapRoute;
  fit?: boolean;
  draggableCenter?: { lng: number; lat: number }; // editor de geocercas
  onCenterChange?: (lng: number, lat: number) => void;
  onRouteInfo?: (info: { eta: number; dist: string; legs?: { label: string; etaMin: number; km: number }[] }) => void;
  themeToggle?: boolean; // muestra el toggle Día/Noche (default true)
  // Centra el mapa en estas coords (vuela sin recargar). nonce fuerza re-disparo
  // aunque se toque el mismo punto otra vez.
  focus?: { lng: number; lat: number; nonce?: number };
  style?: ViewStyle;
}

function buildHtml(config: any): string {
  const CFG = JSON.stringify(config);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${config.preset === 'night' ? '#0f1522' : '#e8eef5'}}
#routeInfo{position:absolute;top:10px;left:10px;z-index:5;display:none;align-items:center;gap:10px;padding:7px 12px;border-radius:12px;background:${config.preset === 'night' ? 'rgba(15,21,34,.95)' : 'rgba(255,255,255,.95)'};box-shadow:0 2px 10px rgba(0,0,0,.15);font:600 13px -apple-system,system-ui,sans-serif;color:${config.preset === 'night' ? '#fff' : '#0f172a'}}
#routeInfo .sep{color:#94a3b8;font-weight:400}
</style>
</head><body><div id="map"></div><div id="routeInfo"></div><script>
var CFG=${CFG};
function post(o){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
// Reenviar errores de Google Maps (RefererNotAllowed, ApiNotActivated, InvalidKey, billing)
// a los logs de la app para diagnosticarlos sin abrir la consola del WebView.
var _ce=console.error;console.error=function(){try{post({type:'gmerror',message:Array.prototype.join.call(arguments,' ')});}catch(e){}try{_ce.apply(console,arguments);}catch(e){}};
window.gm_authFailure=function(){post({type:'gmerror',message:'gm_authFailure: key invalida / referrer no permitido / API no habilitada / billing sin activar'});};
// Estilos día/noche (equivalentes a los de la web).
var DAY_STYLE=[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'poi.business',stylers:[{visibility:'off'}]},{featureType:'transit',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#c7dcf0'}]},{featureType:'landscape',elementType:'geometry',stylers:[{color:'#f3f4f6'}]}];
var NIGHT_STYLE=[{elementType:'geometry',stylers:[{color:'#1d2331'}]},{elementType:'labels.text.stroke',stylers:[{color:'#1d2331'}]},{elementType:'labels.text.fill',stylers:[{color:'#8ea0bf'}]},{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},{featureType:'poi.business',stylers:[{visibility:'off'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#2a3244'}]},{featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'road.highway',elementType:'geometry',stylers:[{color:'#3a4256'}]},{featureType:'transit',stylers:[{visibility:'off'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#0f1522'}]},{featureType:'landscape',elementType:'geometry',stylers:[{color:'#232a3a'}]}];
function stylesFor(p){return p==='night'?NIGHT_STYLE:DAY_STYLE;}
function LL(lng,lat){return {lat:lat,lng:lng};}
function dot(color){return {path:google.maps.SymbolPath.CIRCLE,scale:8,fillColor:color||'#2563EB',fillOpacity:1,strokeColor:'#fff',strokeWeight:3};}
window.__markers=[];
window.initMap=function(){try{
  var isSat=(CFG.mapStyle||'streets')==='satellite';
  var center=CFG.center?LL(CFG.center[0],CFG.center[1]):LL(9.19,45.4642);
  var map=new google.maps.Map(document.getElementById('map'),{center:center,zoom:CFG.zoom||11,disableDefaultUI:true,zoomControl:true,clickableIcons:false,mapTypeId:isSat?'satellite':'roadmap',styles:isSat?[]:stylesFor(CFG.preset||'day'),gestureHandling:'greedy'});
  window.__map=map;window.__center=center;
  // Reajuste de tamaño (dentro de modales/scroll el contenedor puede iniciar en 0x0).
  // Si hay un recorrido/encuadre activo re-encuadramos a esos límites; si no, recentramos
  // al centro. OJO: NO forzar el centro por defecto cuando hay ruta, o el mapa "salta"
  // de vuelta al default (p.ej. Milano) tapando el trazado en cada resize.
  var reapply=function(){try{google.maps.event.trigger(map,'resize');if(window.__fitBounds){map.fitBounds(window.__fitBounds,50);}else{map.setCenter(window.__center);}}catch(e){}};
  try{if(window.ResizeObserver){new ResizeObserver(reapply).observe(document.getElementById('map'));}}catch(e){}
  setTimeout(reapply,350);
  window.__setPreset=function(p){try{if(!isSat)map.setOptions({styles:stylesFor(p)});}catch(e){}};
  window.__focus=function(lng,lat){try{map.panTo(LL(lng,lat));map.setZoom(15);var best=null,bd=1e9;window.__markers.forEach(function(o){var dd=Math.abs(o.lng-lng)+Math.abs(o.lat-lat);if(dd<bd){bd=dd;best=o;}});if(best&&best.info){window.__markers.forEach(function(o){o.info&&o.info.close();});best.info.open({map:map,anchor:best.mk});}}catch(e){}};

  var bounds=new google.maps.LatLngBounds();var has=false;
  (CFG.markers||[]).forEach(function(m){
    var mk=new google.maps.Marker({position:LL(m.lng,m.lat),map:map,icon:dot(m.color)});
    var info=null;
    if(m.popup){info=new google.maps.InfoWindow({content:m.popup});mk.addListener('click',function(){window.__markers.forEach(function(o){o.info&&o.info.close();});info.open({map:map,anchor:mk});});}
    window.__markers.push({lng:m.lng,lat:m.lat,mk:mk,info:info});
    bounds.extend(LL(m.lng,m.lat));has=true;
  });
  (CFG.circles||[]).forEach(function(c){
    new google.maps.Circle({center:LL(c.lng,c.lat),radius:c.radius,map:map,fillColor:c.color||'#3B82F6',fillOpacity:0.2,strokeColor:c.color||'#2563EB',strokeWeight:2});
    bounds.extend(LL(c.lng,c.lat));has=true;
  });
  if(CFG.draggableCenter){
    var dc=CFG.draggableCenter;
    var dm=new google.maps.Marker({position:LL(dc.lng,dc.lat),map:map,draggable:true,icon:dot('#2563EB')});
    dm.addListener('dragend',function(){var p=dm.getPosition();post({type:'center',lng:p.lng(),lat:p.lat()});});
    map.addListener('click',function(e){dm.setPosition(e.latLng);post({type:'center',lng:e.latLng.lng(),lat:e.latLng.lat()});});
    bounds.extend(LL(dc.lng,dc.lat));has=true;
  }
  if(CFG.route){drawRoute(map,CFG.route);return;}
  if(CFG.fit&&has){try{window.__fitBounds=bounds;map.fitBounds(bounds,60);google.maps.event.addListenerOnce(map,'idle',function(){if(map.getZoom()>16)map.setZoom(16);});}catch(e){}}
}catch(err){post({type:'error',message:String(err)});}};

function drawRoute(map,route){
  var done=function(path){
    new google.maps.Polyline({path:path,map:map,strokeColor:'#FFC933',strokeWeight:5,strokeOpacity:0.9});
    var b=new google.maps.LatLngBounds();path.forEach(function(p){b.extend(p);});window.__fitBounds=b;try{map.fitBounds(b,50);google.maps.event.addListenerOnce(map,'idle',function(){if(map.getZoom()>16)map.setZoom(16);});}catch(e){}
  };
  if(route.coordinates){done(route.coordinates.map(function(c){return LL(c[0],c[1]);}));return;}
  var geo=new google.maps.Geocoder();
  var g=function(addr){return new Promise(function(res){
    if(!addr){res(null);return;}
    var m=(''+addr).trim().match(/^(-?\\d{1,3}(?:\\.\\d+)?),\\s*(-?\\d{1,3}(?:\\.\\d+)?)$/);
    if(m){res(LL(parseFloat(m[2]),parseFloat(m[1])));return;}
    geo.geocode({address:addr,region:'it'},function(r,st){res(st==='OK'&&r[0]?r[0].geometry.location:null);});
  });};
  var wps=(route.waypoints||[]).filter(function(w){return !!w;});
  Promise.all([g(route.originAddress),g(route.destinationAddress)].concat(wps.map(g))).then(function(rr){
    var o=rr[0],d=rr[1];if(!o||!d){post({type:'routeError'});return;}
    var wl=rr.slice(2).filter(function(x){return !!x;});
    new google.maps.Marker({position:o,map:map,icon:dot('#16A34A')});
    wl.forEach(function(w){new google.maps.Marker({position:w,map:map,icon:dot('#F97316')});});
    new google.maps.Marker({position:d,map:map,icon:dot('#DC2626')});
    var ds=new google.maps.DirectionsService();
    ds.route({origin:o,destination:d,waypoints:wl.map(function(loc){return {location:loc,stopover:true};}),travelMode:google.maps.TravelMode.DRIVING},function(res,st){
      if(st==='OK'&&res.routes&&res.routes[0]){var rt=res.routes[0];var legs=rt.legs||[];var tmin=0,tm=0;var stopLbls=wps.concat([route.destinationAddress]);var cum=[];var am=0,akm=0;legs.forEach(function(l,i){tmin+=l.duration?l.duration.value:0;tm+=l.distance?l.distance.value:0;am+=l.duration?l.duration.value:0;akm+=l.distance?l.distance.value:0;cum.push({label:stopLbls[i]||('Parada '+(i+1)),etaMin:Math.round(am/60),km:Math.round(akm/100)/10});});var totMin=Math.round(tmin/60);var hh=Math.floor(totMin/60);var mm=totMin%60;var etaTxt=hh>0?(mm>0?hh+'h '+mm+'min':hh+'h'):mm+' min';var kmTxt=(tm/1000).toFixed(1)+' km';var ri=document.getElementById('routeInfo');if(ri){ri.innerHTML='<span>\\u23F1 '+etaTxt+'</span><span class="sep">\\u00B7</span><span>\\u27A4 '+kmTxt+'</span>';ri.style.display='flex';}post({type:'route',eta:totMin,dist:(tm/1000).toFixed(1),legs:cum});done(rt.overview_path);}
      else{done([o].concat(wl).concat([d]));}
    });
  });
}
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${config.key}&libraries=geometry&callback=initMap"></script>
</body></html>`;
}

export default function MapboxWebView(props: MapboxWebViewProps) {
  const { onCenterChange, onRouteInfo, style, themeToggle = true } = props;
  const { isDark } = useTheme();
  const webRef = useRef<WebView>(null);
  // Preset inicial según el tema de la app; se fija al montar (no reconstruye el mapa).
  const initialPreset = useRef<Preset>(isDark ? 'night' : 'day').current;
  const [preset, setPreset] = useState<Preset>(initialPreset);

  const changePreset = (p: Preset) => {
    setPreset(p);
    webRef.current?.injectJavaScript(`window.__setPreset && window.__setPreset('${p}'); true;`);
  };

  // En iOS, el WebView dentro de un Modal a veces no pinta si se monta durante la
  // animación de apertura. Lo montamos un instante después para que el WKWebView
  // se cree con el modal ya presentado.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(t);
  }, []);

  // Volar al punto enfocado (tocar una tarjeta) sin recargar el mapa.
  const focus = props.focus;
  useEffect(() => {
    if (focus && webRef.current) {
      webRef.current.injectJavaScript(`window.__focus && window.__focus(${focus.lng}, ${focus.lat}); true;`);
    }
  }, [focus?.lng, focus?.lat, focus?.nonce]);

  const config = useMemo(
    () => ({
      key: Env.GOOGLE_MAPS_KEY,
      center: props.center,
      zoom: props.zoom,
      mapStyle: props.mapStyle || 'streets',
      preset: initialPreset,
      markers: props.markers,
      circles: props.circles,
      route: props.route,
      fit: props.fit,
      draggableCenter: props.draggableCenter,
    }),
    // Reconstruir el HTML solo cuando cambian los datos relevantes.
    [
      props.center,
      props.zoom,
      props.mapStyle,
      JSON.stringify(props.markers),
      JSON.stringify(props.circles),
      JSON.stringify(props.route),
      props.fit,
      props.draggableCenter?.lng,
      props.draggableCenter?.lat,
    ]
  );

  const html = useMemo(() => buildHtml(config), [config]);

  const onMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'center' && onCenterChange) onCenterChange(msg.lng, msg.lat);
      if (msg.type === 'route' && onRouteInfo) onRouteInfo({ eta: msg.eta, dist: msg.dist, legs: msg.legs });
      if (msg.type === 'gmerror') console.warn('[MapWebView] GMAPS:', msg.message);
      if (msg.type === 'error') console.warn('[MapWebView] JS error en el mapa:', msg.message);
      if (msg.type === 'routeError') console.warn('[MapWebView] no se pudo geocodificar la ruta');
      if (msg.type === 'log') console.warn('[MapWebView] ', msg.message);
    } catch {}
  };

  const C = Theme.colors;
  const loadBg = initialPreset === 'night' ? '#0f1522' : '#e8eef5';
  return (
    <View style={[styles.container, { backgroundColor: loadBg }, style]}>
      {ready && (
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          // baseUrl da al documento un origen/referrer real: necesario para que una
          // API key de Google Maps con restricción de referrer acepte el mapa dentro
          // del WebView. Este dominio DEBE estar en el allowlist de referrers de la key.
          source={{ html, baseUrl: 'https://falconext-logistica-web.vercel.app' }}
          onMessage={onMessage}
          style={[styles.web, { opacity: 0.99 }]}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          androidLayerType="hardware"
          setBuiltInZoomControls={false}
          onError={(e: any) => console.warn('[MapWebView] onError:', e?.nativeEvent?.description)}
          onHttpError={(e: any) => console.warn('[MapWebView] onHttpError:', e?.nativeEvent?.statusCode, e?.nativeEvent?.url)}
          onContentProcessDidTerminate={() => console.warn('[MapWebView] contentProcess terminado')}
          injectedJavaScriptBeforeContentLoaded={`window.onerror=function(m,s,l){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:m+' @'+l}));};true;`}
        />
      )}
      {themeToggle && (
        <View style={[styles.toggle, { backgroundColor: C.surface, borderColor: C.border }]}>
          {(['day', 'night'] as Preset[]).map((p) => {
            const active = preset === p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => changePreset(p)}
                style={[styles.toggleBtn, active && { backgroundColor: Theme.colors.accent }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleTxt, { color: active ? '#1a1a1c' : C.textMuted }]}>
                  {p === 'day' ? 'Día' : 'Noche'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sin flex:1: la altura la define el `style` que pasa cada pantalla (height:280,
  // etc.). Con flex:1 el height se ignoraba en columnas y el mapa salía muy chico.
  container: { overflow: 'hidden', backgroundColor: '#e8eef5' },
  web: { flex: 1, backgroundColor: 'transparent' },
  toggle: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
  toggleTxt: { fontSize: 13, fontWeight: '600' },
});

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { Env } from '../constants/Env';
import { Theme } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

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
  onRouteInfo?: (info: { eta: number; dist: string }) => void;
  themeToggle?: boolean; // muestra el toggle Día/Noche (default true)
  style?: ViewStyle;
}

const STYLE_MAP: Record<string, string> = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/standard',
};

function buildHtml(config: any): string {
  const CFG = JSON.stringify(config);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${config.preset === 'night' ? '#0f1522' : '#e8eef5'}}</style>
</head><body><div id="map"></div><script>
var CFG=${CFG};
function post(o){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
function circle(lng,lat,r){var c=[];var dx=r/(111320*Math.cos(lat*Math.PI/180));var dy=r/110540;for(var i=0;i<=64;i++){var t=i/64*2*Math.PI;c.push([lng+dx*Math.cos(t),lat+dy*Math.sin(t)]);}return{type:'Feature',geometry:{type:'Polygon',coordinates:[c]}};}
function geocode(a){return fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodeURIComponent(a)+'.json?limit=1&access_token='+CFG.token).then(function(r){return r.json();}).then(function(j){return (j.features&&j.features[0])?j.features[0].center:null;}).catch(function(){return null;});}
try{
mapboxgl.accessToken=CFG.token;
var styleMap={dark:'mapbox://styles/mapbox/dark-v11',satellite:'mapbox://styles/mapbox/satellite-streets-v12',streets:'mapbox://styles/mapbox/standard'};
var map=new mapboxgl.Map({container:'map',style:styleMap[CFG.mapStyle]||styleMap.streets,center:CFG.center||[-77.04,-12.04],zoom:CFG.zoom||11,attributionControl:false});
map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
var isStandard=(CFG.mapStyle||'streets')==='streets';
function applyTheme(p){try{if(isStandard){map.setConfigProperty('basemap','theme','faded');map.setConfigProperty('basemap','lightPreset',p);}}catch(e){}}
window.__setPreset=function(p){applyTheme(p);};
map.on('style.load',function(){applyTheme(CFG.preset||'day');});
map.on('load',function(){
  var bounds=new mapboxgl.LngLatBounds();var has=false;
  (CFG.markers||[]).forEach(function(m){var mk=new mapboxgl.Marker({color:m.color||'#2563EB'}).setLngLat([m.lng,m.lat]);if(m.popup)mk.setPopup(new mapboxgl.Popup({offset:14,closeButton:false}).setHTML(m.popup));mk.addTo(map);bounds.extend([m.lng,m.lat]);has=true;});
  (CFG.circles||[]).forEach(function(c,i){var poly=circle(c.lng,c.lat,c.radius);map.addSource('c'+i,{type:'geojson',data:poly});map.addLayer({id:'cf'+i,type:'fill',source:'c'+i,paint:{'fill-color':c.color||'#3B82F6','fill-opacity':0.2}});map.addLayer({id:'cl'+i,type:'line',source:'c'+i,paint:{'line-color':c.color||'#2563EB','line-width':2}});bounds.extend([c.lng,c.lat]);has=true;});
  if(CFG.draggableCenter){var dc=CFG.draggableCenter;var dm=new mapboxgl.Marker({color:'#2563EB',draggable:true}).setLngLat([dc.lng,dc.lat]).addTo(map);dm.on('dragend',function(){var ll=dm.getLngLat();post({type:'center',lng:ll.lng,lat:ll.lat});});map.on('click',function(e){dm.setLngLat(e.lngLat);post({type:'center',lng:e.lngLat.lng,lat:e.lngLat.lat});});bounds.extend([dc.lng,dc.lat]);has=true;}
  if(CFG.route){drawRoute(CFG.route);return;}
  if(CFG.fit&&has){try{map.fitBounds(bounds,{padding:60,maxZoom:15,duration:0});}catch(e){}}
});
function drawRoute(route){
  var done=function(coords){
    map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
    map.addLayer({id:'route',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#FFC933','line-width':5,'line-opacity':0.9}});
    var b=new mapboxgl.LngLatBounds();coords.forEach(function(c){b.extend(c);});try{map.fitBounds(b,{padding:50,duration:0});}catch(e){}
  };
  if(route.coordinates){done(route.coordinates);return;}
  Promise.all([geocode(route.originAddress),geocode(route.destinationAddress)]).then(function(res){
    var o=res[0],d=res[1];if(!o||!d){post({type:'routeError'});return;}
    new mapboxgl.Marker({color:'#16A34A'}).setLngLat(o).addTo(map);
    new mapboxgl.Marker({color:'#DC2626'}).setLngLat(d).addTo(map);
    fetch('https://api.mapbox.com/directions/v5/mapbox/driving/'+o[0]+','+o[1]+';'+d[0]+','+d[1]+'?geometries=geojson&overview=full&access_token='+CFG.token).then(function(r){return r.json();}).then(function(j){
      if(j.routes&&j.routes[0]){post({type:'route',eta:Math.round(j.routes[0].duration/60),dist:(j.routes[0].distance/1000).toFixed(1)});done(j.routes[0].geometry.coordinates);}
      else{done([o,d]);}
    }).catch(function(){done([o,d]);});
  });
}
}catch(err){post({type:'error',message:String(err)});}
</script></body></html>`;
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

  const config = useMemo(
    () => ({
      token: Env.MAPBOX_TOKEN,
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
      if (msg.type === 'route' && onRouteInfo) onRouteInfo({ eta: msg.eta, dist: msg.dist });
    } catch {}
  };

  const C = Theme.colors;
  const loadBg = initialPreset === 'night' ? '#0f1522' : '#e8eef5';
  return (
    <View style={[styles.container, { backgroundColor: loadBg }, style]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
      />
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
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#e8eef5' },
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

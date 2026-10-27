export function observedWind(weather,now=Date.now()){
 const o=weather?.observation,age=now-Date.parse(o?.observedAt);if(!o||!Number.isFinite(age)||age< -5000||age>3600000||!o.windDirection||!o.windSpeed)return null;
 const unit=o.windSpeed.unit,speed=o.windSpeed.value*(unit==='wmoUnit:km_h-1'?1/3.6:unit==='wmoUnit:m_s-1'?1:NaN);
 return Number.isFinite(speed)&&speed>=0&&o.windDirection.value>=0&&o.windDirection.value<=360?{speedMps:speed,fromDegrees:o.windDirection.value,observedAt:o.observedAt}:null;
}

export function mapWind(weather,now=Date.now()){
 const observed=observedWind(weather,now);if(observed)return {...observed,kind:'observation',label:'station observation'};
 const updated=Date.parse(weather?.forecastUpdatedAt),age=now-updated;
 if(!Number.isFinite(age)||age< -5000||age>21600000)return null;
 const hour=weather?.forecast?.find(h=>Date.parse(h.startTime)<=now&&now<Date.parse(h.startTime)+3600000);if(!hour)return null;
 const directions={N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5};
 const match=String(hour.windSpeed).match(/^(\d+)(?: to (\d+))? mph$/);
 if(!match||directions[hour.windDirection]===undefined)return null;
 return {kind:'forecast',label:'NWS hourly forecast',fromDegrees:directions[hour.windDirection],speedMps:(Number(match[1])+Number(match[2]||match[1]))/2*.44704,observedAt:weather.forecastUpdatedAt,validFrom:hour.startTime};
}

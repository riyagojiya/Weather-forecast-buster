# Usage: python3 tools/build_data.py path/to/IndianWeatherRepository.csv
# Rule: one reading per location per day = the latest reading of that day. No values are altered.
import sys,json,os,pandas as pd
F=['temperature_celsius','precip_mm','humidity','wind_kph','pressure_mb','cloud','visibility_km','uv_index']
d=pd.read_csv(sys.argv[1],usecols=['location_name','region','latitude','longitude','last_updated']+F)
d['day']=d.last_updated.str[:10]
total=len(d); locs=d.groupby(['location_name','region']).ngroups
d=d.sort_values('last_updated').drop_duplicates(['day','location_name','region'],keep='last')
os.makedirs('data',exist_ok=True); days={}
dates=sorted(d.day.unique()); daily={f:[] for f in F}; counts=[]
for day in dates:
    g=d[d.day==day]; counts.append(len(g))
    for f in F: daily[f].append(round(float(g[f].mean()),2))
    rows=g[['location_name','region','latitude','longitude','last_updated']+F].values.tolist()
    days[day]=rows
meta=dict(dates=dates,regions=sorted(d.region.unique().tolist()),counts=counts,daily=daily,records=total,locations=locs)
open('data/index.js','w').write('window.WX_META='+json.dumps(meta,separators=(',',':'),ensure_ascii=False)+';window.WX_DAY='+json.dumps(days,separators=(',',':'),ensure_ascii=False)+';')
print(len(dates),'days',total,'records',locs,'locations')

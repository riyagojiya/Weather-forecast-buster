# Usage: python3 tools/build_bust.py path/to/IndianWeatherRepository.csv
# Development baseline: forecast = persistence (issue-day regional mean temperature carried forward). NOT NWP.
import sys,json,numpy as np,pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score as AP,roc_auc_score as AUC,brier_score_loss as BR
d=pd.read_csv(sys.argv[1],usecols=['location_name','region','latitude','longitude','last_updated','temperature_celsius'])
d['day']=d.last_updated.str[:10]
d=d.sort_values('last_updated').drop_duplicates(['day','location_name','region'],keep='last')
cnt=d.groupby('day').size(); d=d[d.day.isin(cnt[cnt>=500].index)]
days=pd.date_range(d.day.min(),d.day.max()).strftime('%Y-%m-%d').tolist(); N=len(days); L=10
g=d.groupby(['region','day']).temperature_celsius
T=g.mean().unstack().reindex(columns=days); S=g.std().unstack().reindex(columns=days).fillna(0)
regs=T.index.tolist(); cent=d.groupby('region')[['latitude','longitude']].mean().reindex(regs).round(2)
Tv,Sv=T.values,S.values; R=[]
for r in range(len(regs)):
  for t in range(5,N):
    h=Tv[r,t-4:t+1]
    if np.isnan(h).any(): continue
    doy=pd.Timestamp(days[t]).dayofyear
    for k in range(1,L+1):
      e=abs(Tv[r,t+k]-Tv[r,t]) if t+k<N else np.nan
      R.append((r,t,k,Tv[r,t],Tv[r,t]-Tv[r,t-3],h.std(),Sv[r,t],np.sin(2*np.pi*doy/365),np.cos(2*np.pi*doy/365),e))
df=pd.DataFrame(R,columns=['r','t','k','temp','chg3','vol5','spat','sin','cos','err'])
n=N-5; a,b=int(.6*n),int(.8*n); EMB=10
tr=(df.t<5+a-EMB); va=(df.t>=5+a)&(df.t<5+b-EMB); te=(df.t>=5+b)
thr=df[tr&df.err.notna()].groupby(['r','k']).err.quantile(.9).rename('thr').reset_index()
df=df.merge(thr,on=['r','k'],how='left'); df['bust']=np.where(df.err.isna(),np.nan,(df.err>=df.thr).astype(float))
F=['k','temp','chg3','vol5','spat','sin','cos','thr']
lab=lambda m:df[m&df.bust.notna()&df.thr.notna()]
Tr,Va,Te=lab(tr),lab(va),lab(te)
m=GradientBoostingClassifier(n_estimators=150,max_depth=3,learning_rate=.05,subsample=.8,random_state=0).fit(Tr[F],Tr.bust)
cal=LogisticRegression().fit(m.decision_function(Va[F]).reshape(-1,1),Va.bust)
P=lambda X:cal.predict_proba(m.decision_function(X[F]).reshape(-1,1))[:,1]
b1=LogisticRegression(max_iter=500).fit(Tr[['vol5','k']],Tr.bust); base=float(Tr.bust.mean())
y=Te.bust.values; pm=P(Te); p1=b1.predict_proba(Te[['vol5','k']])[:,1]; p0=np.full(len(Te),base)
met=lambda p:dict(pr_auc=round(AP(y,p),3),roc_auc=round(AUC(y,p),3) if 0<y.mean()<1 else None,brier=round(BR(y,p),4))
metrics={'Climatological rate (baseline 0)':met(p0),'Recent volatility only (baseline 1)':met(p1),'Gradient boosting + calibration':met(pm)}
Te=Te.assign(p=pm); bins=[0,.1,.2,.3,.5,1.01]; calib=[]
for lo,hi in zip(bins,bins[1:]):
  s=Te[(Te.p>=lo)&(Te.p<hi)]
  if len(s): calib.append(dict(range=f'{lo:.0%}-{min(hi,1):.0%}',n=len(s),pred=round(s.p.mean(),3),obs=round(s.bust.mean(),3)))
lead=[]
for k in range(1,L+1):
  s=Te[Te.k==k]; ok=0<s.bust.mean()<1
  lead.append(dict(k=k,mae=round(s.err.mean(),2),bust=round(s.bust.mean(),3),roc=round(AUC(s.bust,s.p),3) if ok else None))
te_all=df[te&df.thr.notna()].copy(); te_all['p']=P(te_all)
tdays=sorted(te_all.t.unique()); pred={};act={};bu={}
for t in tdays:
  x=te_all[te_all.t==t]; pr=[[-1]*L for _ in regs]; ac=[[-1]*L for _ in regs]; bb=[[-1]*L for _ in regs]
  for r_,k_,p_,e_,b_ in zip(x.r,x.k,x.p,x.err,x.bust):
    pr[int(r_)][int(k_)-1]=round(float(p_),3)
    if not np.isnan(e_): ac[int(r_)][int(k_)-1]=round(float(e_),2); bb[int(r_)][int(k_)-1]=int(b_)
  pred[days[t]]=pr;act[days[t]]=ac;bu[days[t]]=bb
D=lambda i:days[i]
meta=dict(base=round(base,3),threshold='Error >= 90th percentile of training-period absolute error, per region and lead day',embargo=EMB,
 train=[D(5),D(5+a-EMB-1)],val=[D(5+a),D(5+b-EMB-1)],test=[D(5+b),D(N-1)],n_train=len(Tr),n_test=len(Te),test_bust=round(float(y.mean()),3),
 metrics=metrics,calib=calib,lead=lead,features=F,importance=sorted([[f,round(float(i),3)] for f,i in zip(F,m.feature_importances_)],key=lambda z:-z[1]))
out=dict(meta=meta,regions=regs,cent=cent.values.tolist(),dates=sorted(pred),pred=pred,act=act,bust=bu)
open('data/bust.js','w').write('window.WX_BUST='+json.dumps(out,separators=(',',':'))+';')
print(json.dumps(meta)[:1500])

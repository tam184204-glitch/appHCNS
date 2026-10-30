const B='http://127.0.0.1:3600';(async()=>{
const j=async u=>{const r=await fetch(B+u);const t=await r.text();try{return{s:r.status,b:JSON.parse(t)}}catch{return{s:r.status,b:t}}};
const m=await j('/api/meta');console.log('meta',m.s,m.b.me?.full_name,m.b.me?.role,m.b.menu?.length);
for(const c of ['VPP06','TS02','XC02','XC03','GT02','SA04','SA05','SK03','PH02','XC06','TD04','HS02','HD12','HD13','CC12','CC13','TL05','BH-01','BH-02','CĐ-01','CĐ-02','CCTC05','PLI']){const u=`/api/report/${encodeURIComponent(c)}?month=${c=='BH-01'||c=='CĐ-01'?'2026-11':'2026-10'}`;const r=await j(u);console.log(c,r.s,r.s==200?r.b.rows.length+' '+JSON.stringify(r.b.kpis.map(k=>k[1])):r.b.error)}
for(const d of ['DB01','DB02','DB03','DB04','DB05','DB06']){const r=await j('/api/dash/'+d);console.log(d,r.s,r.s==200?JSON.stringify(r.b.kpis.map(k=>k[1])):r.b.error)}
for(const e of Object.keys(m.b.ents)){const r=await j('/api/e/'+e);if(r.s!=200)console.log('E',e,r.s,r.b.error)}
const jb=await j('/api/jobs');console.log(jb.b);
})()

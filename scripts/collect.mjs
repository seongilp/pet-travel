import { writeFileSync, existsSync, readFileSync } from "node:fs";
const key=process.env.HORSE;
const APP="pettravel";
const listBase="https://apis.data.go.kr/B551011/KorPetTourService2/areaBasedList2";
const detailBase="https://apis.data.go.kr/B551011/KorPetTourService2/detailPetTour2";
const OUT=new URL("./pet-raw.json", import.meta.url).pathname;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function itemsOf(j){const it=j?.response?.body?.items;if(!it||it==="")return[];const a=it.item;return Array.isArray(a)?a:(a?[a]:[]);}
async function jget(url){for(let a=0;a<6;a++){try{const t=await (await fetch(url,{signal:AbortSignal.timeout(25000)})).text();const j=JSON.parse(t);const rc=j?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;if(rc==="23"){await sleep(600+a*400);continue;}if(rc==="22"){return{DAILY:true};}return j;}catch{await sleep(500+a*300);}}return null;}

(async()=>{
  // 1) 전체 리스트
  let list=[];
  const rows=100;
  const first=await jget(`${listBase}?serviceKey=${key}&MobileOS=ETC&MobileApp=${APP}&_type=json&numOfRows=${rows}&pageNo=1&arrange=C`);
  const total=first?.response?.body?.totalCount||0;
  const pages=Math.ceil(total/rows);
  list.push(...itemsOf(first));
  process.stderr.write(`total=${total} pages=${pages}\n`);
  for(let p=2;p<=pages;p++){
    const j=await jget(`${listBase}?serviceKey=${key}&MobileOS=ETC&MobileApp=${APP}&_type=json&numOfRows=${rows}&pageNo=${p}&arrange=C`);
    if(j?.DAILY){process.stderr.write("DAILY LIMIT on list\n");break;}
    list.push(...itemsOf(j));
    await sleep(140);
    if(p%20===0)process.stderr.write(`list page ${p}/${pages} (${list.length})\n`);
  }
  // dedupe
  list=[...new Map(list.map(s=>[s.contentid,s])).values()];
  process.stderr.write(`collected list=${list.length}\n`);

  // 2) detail 전건 (resumable)
  let details={};
  if(existsSync(OUT)){try{details=JSON.parse(readFileSync(OUT,"utf8")).details||{};}catch{}}
  let done=Object.keys(details).length, dailyHit=false;
  for(const s of list){
    if(details[s.contentid])continue;
    const j=await jget(`${detailBase}?serviceKey=${key}&MobileOS=ETC&MobileApp=${APP}&_type=json&contentId=${s.contentid}`);
    if(j?.DAILY){process.stderr.write(`DAILY LIMIT on detail after ${done}\n`);dailyHit=true;break;}
    const it=itemsOf(j)[0]||{};
    details[s.contentid]={
      acmpyTypeCd:it.acmpyTypeCd||"", acmpyPsblCpam:it.acmpyPsblCpam||"",
      acmpyNeedMtr:it.acmpyNeedMtr||"", etcAcmpyInfo:it.etcAcmpyInfo||"",
      relaAcdntRiskMtr:it.relaAcdntRiskMtr||"", relaPosesFclty:it.relaPosesFclty||"",
      relaFrnshPrdlst:it.relaFrnshPrdlst||"", relaPurcPrdlst:it.relaPurcPrdlst||"", relaRntlPrdlst:it.relaRntlPrdlst||""
    };
    done++;
    await sleep(190);
    if(done%200===0){writeFileSync(OUT,JSON.stringify({list,details}));process.stderr.write(`detail ${done}/${list.length}\n`);}
  }
  writeFileSync(OUT,JSON.stringify({list,details,dailyHit,total}));
  process.stderr.write(`DONE list=${list.length} details=${Object.keys(details).length} dailyHit=${dailyHit}\n`);
})();

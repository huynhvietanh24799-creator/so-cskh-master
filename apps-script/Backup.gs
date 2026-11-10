/**
 * Sổ CSKH – SAO LƯU TỰ ĐỘNG 23H VÀO DRIVE CỦA CHI NHÁNH: __BNAME__
 * ---------------------------------------------------------------
 * Chạy trong Gmail của GĐ chi nhánh. Mỗi đêm 23h tự gom dữ liệu chi nhánh và lưu vào Drive CỦA BẠN:
 *   • Thư mục "Ba mẹ" → mỗi ba mẹ 1 thư mục gồm 2 file Google Sheet:
 *       1) "<Tên> – Hồ sơ & quá trình": thông tin ba mẹ + toàn bộ báo cáo, điểm danh, kế hoạch, ghi chú từ lúc đi tập máy đến nay
 *       2) "<Tên> – Quá trình thực hành PPTN": phiếu thân nhiệt, tình trạng sức khoẻ, độ nhẹ
 *   • File .json đầy đủ của cả chi nhánh theo ngày (giữ 14 bản gần nhất, dùng để khôi phục)
 * Không ai khác (kể cả GĐ Vùng) mở được các file này.
 *
 * CÀI ĐẶT (1 lần): dán mã này vào script.google.com → chọn hàm "caiDat" → ▶ Chạy → Cho phép quyền.
 * Muốn dừng: chọn hàm "tatTuDong" → ▶ Chạy.
 */
const BRANCH_ID = "__BID__";
const BRANCH_NAME = "__BNAME__";
const PROJECT = "__PID__";
const API_KEY = "__KEY__";
const REFRESH_TOKEN = "__RT__";   // khoá riêng của bạn – không chia sẻ mã này cho ai
const KEEP_JSON = 14;

function caiDat(){
  tatTuDong();
  ScriptApp.newTrigger("saoLuuDem").timeBased().everyDays(1).atHour(23).nearMinute(0).inTimezone("Asia/Ho_Chi_Minh").create();
  const r = saoLuuDem();
  Logger.log("Đã bật sao lưu tự động 23h mỗi đêm. Lần đầu: " + JSON.stringify(r));
}
function tatTuDong(){ ScriptApp.getProjectTriggers().forEach(t=>{ if(t.getHandlerFunction()==="saoLuuDem") ScriptApp.deleteTrigger(t); }); }

/* ---------- Firestore (đọc bằng chính tài khoản GĐ chi nhánh) ---------- */
const FS = "https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents";
function token_(){
  const r = UrlFetchApp.fetch("https://securetoken.googleapis.com/v1/token?key="+API_KEY,
    {method:"post", payload:{grant_type:"refresh_token", refresh_token:REFRESH_TOKEN}, muteHttpExceptions:true});
  const j = JSON.parse(r.getContentText());
  if(!j.id_token) throw new Error("Khoá đăng nhập hết hạn hoặc bị thu hồi – hãy lấy mã mới trong app (Chi nhánh → Sao lưu tự động)");
  return j.id_token;
}
function dec_(v){
  if(v==null) return null;
  if("stringValue" in v) return v.stringValue;
  if("integerValue" in v) return Number(v.integerValue);
  if("doubleValue" in v) return v.doubleValue;
  if("booleanValue" in v) return v.booleanValue;
  if("nullValue" in v) return null;
  if("timestampValue" in v) return v.timestampValue;
  if("arrayValue" in v) return (v.arrayValue.values||[]).map(dec_);
  if("mapValue" in v){ const o={}, f=v.mapValue.fields||{}; for(const k in f) o[k]=dec_(f[k]); return o; }
  return null;
}
function docObj_(d){ const o={id:d.name.split("/").pop()}, f=d.fields||{}; for(const k in f) o[k]=dec_(f[k]); return o; }
function get_(tok, url, tries){
  for(let i=0;i<(tries||3);i++){
    const r = UrlFetchApp.fetch(url,{headers:{Authorization:"Bearer "+tok}, muteHttpExceptions:true});
    const c = r.getResponseCode();
    if(c===200) return JSON.parse(r.getContentText());
    if(c===404) return {};
    if(c===429||c>=500){ Utilities.sleep(1500*(i+1)); continue; }
    throw new Error("Firestore "+c+": "+r.getContentText().slice(0,200));
  }
  throw new Error("Firestore bận, thử lại sau");
}
function list_(tok, path){
  const out=[]; let pt="";
  do{ const j=get_(tok, FS+"/"+path+"?pageSize=300"+(pt?"&pageToken="+encodeURIComponent(pt):""));
      (j.documents||[]).forEach(d=>out.push(docObj_(d))); pt=j.nextPageToken||""; }while(pt);
  return out;
}
function staffOfBranch_(tok){
  const r = UrlFetchApp.fetch(FS+":runQuery",{method:"post",contentType:"application/json",headers:{Authorization:"Bearer "+tok},muteHttpExceptions:true,
    payload:JSON.stringify({structuredQuery:{from:[{collectionId:"staff"}],where:{fieldFilter:{field:{fieldPath:"chiNhanh"},op:"EQUAL",value:{stringValue:BRANCH_ID}}}}})});
  if(r.getResponseCode()!==200) throw new Error("Không đọc được danh sách nhân sự: "+r.getContentText().slice(0,200));
  return JSON.parse(r.getContentText()).filter(x=>x.document).map(x=>docObj_(x.document));
}
function collect_(tok){
  const D = {app:"So CSKH", branch:{id:BRANCH_ID,name:BRANCH_NAME}, exportedAt:new Date().toISOString(), staff:{}, nhatky:[]};
  staffOfBranch_(tok).forEach(s=>{
    const st={info:s}; ["parents","plans","logs","att","notes"].forEach(k=>{ st[k]=list_(tok,"staff/"+s.id+"/"+k); }); D.staff[s.id]=st; });
  D.nhatky = list_(tok,"branches/"+BRANCH_ID+"/nhatky");
  return D;
}

/* ---------- ghi vào Drive ---------- */

function reportStatus_(tok, nBm){
  const now=Date.now(), d=Utilities.formatDate(new Date(),"Asia/Ho_Chi_Minh","yyyy-MM-dd");
  const f={lastAt:{integerValue:String(now)},lastDate:{stringValue:d},byName:{stringValue:"Tự động 23h"},nBm:{integerValue:String(nBm)},auto:{booleanValue:true}};
  UrlFetchApp.fetch(FS+"/branches/"+BRANCH_ID+"/meta/backup?"+["lastAt","lastDate","byName","nBm","auto"].map(k=>"updateMask.fieldPaths="+k).join("&"),
    {method:"patch",contentType:"application/json",headers:{Authorization:"Bearer "+tok},payload:JSON.stringify({fields:f}),muteHttpExceptions:true});
}

/* ---------- thư mục & tệp ---------- */
function sub_(parent,name){ const it=parent.getFoldersByName(name); return it.hasNext()?it.next():parent.createFolder(name); }
function root_(){ const name="Sổ CSKH – "+BRANCH_NAME, it=DriveApp.getFoldersByName(name); return it.hasNext()?it.next():DriveApp.createFolder(name); }
function safe_(s){ return String(s||"").replace(/[\\\/:*?"<>|#\[\]]+/g," ").replace(/\s+/g," ").trim().slice(0,80)||"Ba mẹ"; }
function sheetIn_(folder, id, name){
  if(id){ try{ const f=DriveApp.getFileById(id); if(!f.isTrashed()){ if(f.getName()!==name) f.setName(name); return SpreadsheetApp.openById(id); } }catch(e){} }
  const ss=SpreadsheetApp.create(name); DriveApp.getFileById(ss.getId()).moveTo(folder); return ss;
}
function put_(ss, name, rows, widths){
  let sh=ss.getSheetByName(name)||ss.insertSheet(name); sh.clear();
  const w=Math.max.apply(null, rows.map(r=>r.length).concat([1]));
  if(rows.length) sh.getRange(1,1,rows.length,w).setValues(rows.map(r=>{ const x=r.slice(); while(x.length<w) x.push(""); return x.map(v=>v==null?"":(typeof v==="string"&&v.length>45000?v.slice(0,45000):v)); }));
  (widths||[]).forEach((px,i)=>sh.setColumnWidth(i+1,px)); sh.setWrap(true); sh.setVerticalAlignment("top");
  return sh;
}
function dropFirst_(ss){ const f=ss.getSheetByName("Sheet1")||ss.getSheetByName("Trang tính1"); if(f&&ss.getSheets().length>1) ss.deleteSheet(f); }

/* ---------- gộp báo cáo theo ngày (giống app) ---------- */
function ts_(l){ return Number(l.createdAt||l.updatedAt||0); }
function mergeLogs_(rows){
  const g={}; rows.filter(r=>!r.mergedInto).forEach(r=>{ const k=r.date||""; (g[k]=g[k]||[]).push(r); });
  return Object.keys(g).sort().map(d=>{ const list=g[d].sort((a,b)=>ts_(a)-ts_(b)), m={date:d,tn:{},talks:[],pyph:false,pyphNote:[],doNhe:null,khMai:[],ghiChu:[],bys:[]};
    ["truocTren","truocDuoi","sauTren","sauDuoi"].forEach(k=>{ list.forEach(r=>{ const v=r.tn&&r.tn[k]; if(v!=null&&v!=="") m.tn[k]=v; }); });
    list.forEach(r=>{ if(Array.isArray(r.talks)&&r.talks.length) r.talks.forEach(t=>t&&t.t&&m.talks.push(t.t)); else if(r.baoCao) m.talks.push(r.baoCao);
      if(r.pyph) m.pyph=true; if(r.pyphNote) m.pyphNote.push(r.pyphNote); if(r.doNhe) m.doNhe=r.doNhe; else if(!m.doNhe) m._old=r;
      if(r.khMai) m.khMai.push(r.khMai); if(r.ghiChu) m.ghiChu.push(r.ghiChu); if(r.by) m.bys.push(r.by); });
    if(!m.doNhe){ const r=m._old, sk=r&&Array.isArray(r.sucKhoe)&&r.sucKhoe[0];
      if(sk||(r&&r.hieuQua)) m.doNhe={truoc:{m:sk&&sk.truoc!=null?Number(sk.truoc):null,tt:sk&&sk.ten&&sk.ten!=="Độ nhẹ"?sk.ten:""},sau:{m:sk&&sk.sau!=null?Number(sk.sau):null,tt:(r&&r.hieuQua)||""}}; }
    return m; });
}
const THU_=["Chủ nhật","Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy"];
function dmy_(d){ const p=String(d||"").split("-"); return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:d||""; }
function thu_(d){ const p=String(d||"").split("-").map(Number); return p.length===3?THU_[new Date(p[0],p[1]-1,p[2]).getDay()]:""; }
const n1_=v=>v==null||v===""?"":Number(v);
function uniq_(a){ return a.filter((x,i)=>x&&a.indexOf(x)===i); }

/* ---------- nội dung từng ba mẹ ---------- */
function profile_(p, D, ownerName){
  const L=(a,b)=>[a,b==null?"":b];
  const benh=(p.benh||[]).map(b=>b&&b.ten?(b.ten+(b.baoLau?" ("+b.baoLau+")":"")):"").filter(Boolean).join("; ")||p.tenBenh||"";
  return [["THÔNG TIN BA MẸ",""],
    L("Họ tên",p.tenBaMe),L("Tổ",p.to),L("Loại",p.loai==="tiem_nang"?"Tiềm năng (BMTN)":"Chính thức"),L("Giới tính",p.gioiTinh==="nam"?"Nam":p.gioiTinh==="nu"?"Nữ":""),
    L("Số điện thoại",p.sdt),L("Ngày sinh",dmy_(p.ngaySinh)),L("Địa chỉ",p.diaChi),
    L("Người thân – SĐT",p.sdtNguoiThan),L("Người thân – quan hệ",p.quanHe),
    L("Ngày bắt đầu tập máy",dmy_(p.ngayTapMay)),L("Ca tập",(p.ca||[]).map(c=>"Ca "+c).join(", ")),L("Giờ tập",p.gioTap),
    L("BM hướng dẫn",p.bmHuongDan),L("Người phụ trách",ownerName),L("Thiết bị",(p.thietBi||[]).join(", ")),
    L("Bệnh / tình trạng",benh),L("Mong muốn",p.mongMuon),L("Hoàn cảnh",p.hoanCanh),
    L("Thân nhiệt ban đầu – Trên",n1_(p.tnBDTren)),L("Thân nhiệt ban đầu – Dưới",n1_(p.tnBDDuoi)),
    L("Nách ban đầu",p.nachBD),L("Eo ban đầu",p.eoBD),L("Cẳng chân ban đầu",p.canBD),
    L("Nách hiện tại",p.nachHT),L("Eo hiện tại",p.eoHT),L("Cẳng chân hiện tại",p.canHT),
    L("Cải thiện",p.caiThien),L("Ngày tạo hồ sơ",p.createdAt?Utilities.formatDate(new Date(Number(p.createdAt)),"Asia/Ho_Chi_Minh","dd/MM/yyyy"):"")];
}
function nameOf_(D,sid){ return ((D.staff[sid]||{}).info||{}).name||sid; }
function writeProfile_(ss, p, sid, D, ml, st){
  const owner=nameOf_(D,sid);
  put_(ss,"Thông tin",profile_(p,D,owner),[220,520]);
  const rep=[["Ngày","Thứ","Thân nhiệt trước – Trên","Trước – Dưới","Sau – Trên","Sau – Dưới","Nội dung nói chuyện","PƯPH","Kế hoạch ngày mai","Ghi chú","Người báo cáo"]];
  ml.slice().reverse().forEach(m=>rep.push([dmy_(m.date),thu_(m.date),n1_(m.tn.truocTren),n1_(m.tn.truocDuoi),n1_(m.tn.sauTren),n1_(m.tn.sauDuoi),m.talks.join("\n"),m.pyph?("Có"+(m.pyphNote.length?": "+uniq_(m.pyphNote).join("; "):"")):"",uniq_(m.khMai).join("\n"),uniq_(m.ghiChu).join("\n"),uniq_(m.bys).map(x=>nameOf_(D,x)).join(", ")]));
  put_(ss,"Báo cáo",rep,[90,80,90,80,80,80,420,160,260,200,140]);
  const att=[["Ngày","Thứ","Ca","Trạng thái","Lý do vắng","Ghi chú","Người điểm danh"]];
  (st.att||[]).filter(a=>a.parentId===p.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))).forEach(a=>att.push([dmy_(a.date),thu_(a.date),Array.isArray(a.ca)?a.ca.join(", "):(a.ca||""),a.status==="co"?"Có mặt":a.status==="vang"?"Vắng":(a.status||""),a.lyDo||"",a.ghiChu||"",nameOf_(D,a.by||sid)]));
  put_(ss,"Điểm danh",att,[90,80,80,100,200,260,140]);
  const pl=[["Ngày","Việc cần làm","Trạng thái"]];
  (st.plans||[]).filter(x=>x.parentId===p.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))).forEach(x=>pl.push([dmy_(x.date),x.noiDung||"",x.done?"Xong":"Chưa"]));
  put_(ss,"Kế hoạch",pl,[90,520,100]);
  const nt=[["Ngày","Ghi chú","Người ghi"]];
  (st.notes||[]).filter(x=>x.parentId===p.id).sort((a,b)=>String(b.date).localeCompare(String(a.date))).forEach(x=>nt.push([dmy_(x.date),x.text||"",nameOf_(D,x.by||sid)]));
  put_(ss,"Ghi chú",nt,[90,620,140]);
  dropFirst_(ss);
}
function writePptn_(ss, p, ml, D){
  const rows=[["TÊN CN: "+BRANCH_NAME,"","TỔ: "+(p.to||""),"","TÊN BA MẸ: "+(p.tenBaMe||""),"","","",""],
    ["QUÁ TRÌNH THỰC HÀNH PHƯƠNG PHÁP THÂN NHIỆT","","","","","","","",""],
    ["Thứ","Ngày","Thân nhiệt TRƯỚC (Trên / Dưới)","Tình trạng sức khoẻ TRƯỚC","Độ nhẹ TRƯỚC (0 nhẹ – 10 nặng)","Thân nhiệt SAU (Trên / Dưới)","Tình trạng sức khoẻ SAU","Độ nhẹ SAU (0 nhẹ – 10 nặng)","Ghi chú"]];
  const has=x=>x&&((x.m!=null&&x.m!=="")||String(x.tt||"").trim());
  let n=0;
  ml.slice().reverse().forEach(m=>{ const dn=m.doNhe||{truoc:{},sau:{}}; if(!(has(dn.truoc)||has(dn.sau))) return; n++;
    const tn=(a,b)=>(a==null||a===""?"……":Number(a).toFixed(1))+" / "+(b==null||b===""?"……":Number(b).toFixed(1));
    const gc=[m.pyph?("PƯPH"+(m.pyphNote.length?": "+uniq_(m.pyphNote).join("; "):"")):"",uniq_(m.ghiChu).join("\n")].filter(Boolean).join("\n");
    rows.push([thu_(m.date),dmy_(m.date),tn(m.tn.truocTren,m.tn.truocDuoi),(dn.truoc||{}).tt||"",n1_((dn.truoc||{}).m),tn(m.tn.sauTren,m.tn.sauDuoi),(dn.sau||{}).tt||"",n1_((dn.sau||{}).m),gc]); });
  if(!n) rows.push(["Chưa có buổi nào có Độ nhẹ / Tình trạng sức khoẻ.","","","","","","","",""]);
  rows.push(["Green & Happy Life  |  Thân nhiệt quyết định Sinh – Lão – Bệnh – Tử","","","","","","","",""]);
  const sh=put_(ss,"PPTN",rows,[90,90,170,260,120,170,260,120,260]);
  sh.getRange(1,1,2,9).setFontWeight("bold"); sh.getRange(3,1,1,9).setFontWeight("bold").setBackground("#fce3e5");
  sh.getRange(2,1).setFontSize(14); sh.setFrozenRows(3);
  dropFirst_(ss);
}

/* ---------- chạy sao lưu (chia nhiều lượt nếu chi nhánh lớn, mỗi lượt tối đa ~4,5 phút) ---------- */
const BUDGET_MS = 270000;
function hash_(o){ return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(o))); }
function readJson_(folder, name){ const it=folder.getFilesByName(name); if(!it.hasNext()) return null; try{ return JSON.parse(it.next().getBlob().getDataAsString()); }catch(e){ return null; } }
function writeJson_(folder, name, obj){ const it=folder.getFilesByName(name); const txt=JSON.stringify(obj); if(it.hasNext()) it.next().setContent(txt); else folder.createFile(name, txt, MimeType.PLAIN_TEXT); }
function clearCont_(){ ScriptApp.getProjectTriggers().forEach(t=>{ if(t.getHandlerFunction()==="tiepTuc") ScriptApp.deleteTrigger(t); }); }
function tiepTuc(){ clearCont_(); saoLuuDem(); }
function saoLuuDem(){
  const t0=Date.now(); clearCont_();
  const tok=token_(), D=collect_(tok), root=root_(), baMe=sub_(root,"Ba mẹ");
  const idx=readJson_(root,"_chi_muc.json")||{}, used={}; let done=0, skipped=0, todo=0, nBm=0;
  const items=[];
  Object.keys(D.staff).forEach(sid=>{ const st=D.staff[sid]; (st.parents||[]).forEach(p=>{ if(p.deleted) return; items.push({sid:sid,st:st,p:p}); }); });
  nBm=items.length;
  items.sort((a,b)=>String(a.p.tenBaMe||"").localeCompare(String(b.p.tenBaMe||""),"vi"));
  const dup={}; items.forEach(it=>{ const k=safe_(it.p.tenBaMe).toLowerCase(); dup[k]=(dup[k]||0)+1; });
  for(let i=0;i<items.length;i++){
    const it=items[i], p=it.p, st=it.st, key=it.sid+"|"+p.id, rec=idx[key]||{};
    const logs=(st.logs||[]).filter(l=>l.parentId===p.id), att=(st.att||[]).filter(a=>a.parentId===p.id), plans=(st.plans||[]).filter(x=>x.parentId===p.id), notes=(st.notes||[]).filter(x=>x.parentId===p.id);
    const h=hash_([p,logs,att,plans,notes,nameOf_(D,it.sid)]);
    if(rec.h===h && rec.f && rec.a && rec.b){ skipped++; continue; }
    if(Date.now()-t0>BUDGET_MS){ todo++; continue; }
    const fname=safe_(p.tenBaMe)+(dup[safe_(p.tenBaMe).toLowerCase()]>1?" ("+String(p.id).slice(0,4)+")":"");
    let folder=null; if(rec.f){ try{ folder=DriveApp.getFolderById(rec.f); if(folder.isTrashed()) folder=null; }catch(e){ folder=null; } }
    if(!folder){ folder=baMe.createFolder(fname); rec.a=rec.b=null; } else if(folder.getName()!==fname) folder.setName(fname);
    const ml=mergeLogs_(logs);
    const s1=sheetIn_(folder, rec.a, fname+" – Hồ sơ & quá trình"); writeProfile_(s1,p,it.sid,D,ml,st);
    const s2=sheetIn_(folder, rec.b, fname+" – Quá trình thực hành PPTN"); writePptn_(s2,p,ml,D);
    idx[key]={h:h,f:folder.getId(),a:s1.getId(),b:s2.getId()}; done++; if(done%10===0) writeJson_(root,"_chi_muc.json",idx);
  }
  writeJson_(root,"_chi_muc.json",idx);
  if(todo>0){ ScriptApp.newTrigger("tiepTuc").timeBased().after(60*1000).create(); return {ba_me:nBm, da_ghi:done, bo_qua:skipped, con_lai:todo, ghi_chu:"Còn "+todo+" ba mẹ, tự chạy tiếp sau 1 phút"}; }
  // dọn thư mục của ba mẹ đã bị xoá khỏi sổ
  const live={}; items.forEach(it=>{ live[it.sid+"|"+it.p.id]=1; }); Object.keys(idx).forEach(k=>{ if(!live[k]){ try{ DriveApp.getFolderById(idx[k].f).setTrashed(true); }catch(e){} delete idx[k]; } });
  writeJson_(root,"_chi_muc.json",idx);
  // bản đầy đủ để khôi phục
  const d=Utilities.formatDate(new Date(),"Asia/Ho_Chi_Minh","yyyy-MM-dd"), jn="SoCSKH_"+BRANCH_ID+"_"+d+".json", bk=sub_(root,"Khôi phục (json)");
  const old=bk.getFilesByName(jn); while(old.hasNext()) old.next().setTrashed(true);
  bk.createFile(jn, JSON.stringify(D), MimeType.PLAIN_TEXT);
  const js=[], itf=bk.getFiles(); while(itf.hasNext()){ const f=itf.next(); if(/^SoCSKH_.*\.json$/.test(f.getName())) js.push(f); }
  js.sort((a,b)=>b.getName().localeCompare(a.getName())); js.slice(KEEP_JSON).forEach(f=>f.setTrashed(true));
  reportStatus_(tok,nBm);
  return {ba_me:nBm, da_ghi:done, bo_qua:skipped, thu_muc:root.getUrl()};
}

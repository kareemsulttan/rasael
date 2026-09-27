// مولّد رموز QR (Byte mode, ECC M, الإصدارات 1-10) — يعيد صورة PNG كـ data URL
const QR_EC=[[7,10,13,17],[10,16,22,28],[15,26,36,44],[20,36,52,64],[26,48,72,88],[36,64,96,112],[40,72,108,130],[48,88,132,156],[60,110,160,192],[72,130,192,224]];
const QR_BLK=[[1,1,1,1],[1,1,1,1],[1,1,2,2],[1,2,2,4],[1,2,4,4],[2,4,4,4],[2,4,6,5],[2,4,6,6],[2,5,8,8],[4,5,8,8]];
function rawBits(v){let r=(16*v+128)*v+64;if(v>=2){const na=Math.floor(v/7)+2;r-=(25*na-10)*na-55;if(v>=7)r-=36;}return r;}
function qrMatrix(text){
 const data=[...new TextEncoder().encode(text)];const L=1,FMTL=0;
 let ver;for(ver=1;ver<=10;ver++){const total=Math.floor(rawBits(ver)/8);const dc=total-QR_EC[ver-1][L];const hdr=ver<10?12:20;if(((hdr+data.length*8+7)>>3)<=dc)break;}
 if(ver>10)ver=10;
 const n=ver*4+17,total=Math.floor(rawBits(ver)/8),ecc=QR_EC[ver-1][L],nb=QR_BLK[ver-1][L],dc=total-ecc;
 const bits=[];const push=(v,l)=>{for(let i=l-1;i>=0;i--)bits.push((v>>i)&1);};
 push(4,4);push(data.length,ver<10?8:16);data.forEach(b=>push(b,8));
 push(0,Math.min(4,dc*8-bits.length));while(bits.length%8)bits.push(0);
 for(let p=0xEC;bits.length<dc*8;p^=0xEC^0x11)push(p,8);
 const bytes=[];for(let i=0;i<bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8).join(''),2));
 const EXP=[],LOG=[];for(let i=0,x=1;i<256;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11D;}
 const mul=(a,b)=>a&&b?EXP[(LOG[a]+LOG[b])%255]:0;
 const el=ecc/nb;let gen=[1];for(let i=0;i<el;i++){const ng=new Array(gen.length+1).fill(0);for(let j=0;j<gen.length;j++){ng[j]^=gen[j];ng[j+1]^=mul(gen[j],EXP[i]);}gen=ng;}
 const short=nb-(dc%nb),sl=Math.floor(dc/nb);const blocks=[],eccs=[];let pos=0;
 for(let b=0;b<nb;b++){const len=sl+(b<short?0:1);const d=bytes.slice(pos,pos+len);pos+=len;blocks.push(d);const r=d.concat(new Array(el).fill(0));for(let i=0;i<d.length;i++){const c=r[i];if(c)for(let j=0;j<gen.length;j++)r[i+j]^=mul(gen[j],c);}eccs.push(r.slice(d.length));}
 const out=[];for(let i=0;i<=sl;i++)blocks.forEach(b=>{if(i<b.length)out.push(b[i]);});for(let i=0;i<el;i++)eccs.forEach(e=>out.push(e[i]));
 const m=Array.from({length:n},()=>new Array(n).fill(null));
 const set=(r,c,v)=>{m[r][c]=v?1:0;};
 const finder=(r,c)=>{for(let i=-1;i<=7;i++)for(let j=-1;j<=7;j++){const rr=r+i,cc=c+j;if(rr<0||cc<0||rr>=n||cc>=n)continue;const on=(i>=0&&i<=6&&(j===0||j===6))||(j>=0&&j<=6&&(i===0||i===6))||(i>=2&&i<=4&&j>=2&&j<=4);set(rr,cc,on);}};
 finder(0,0);finder(0,n-7);finder(n-7,0);
 for(let i=8;i<n-8;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 if(ver>=2){const na=Math.floor(ver/7)+2;const step=Math.ceil((n-13)/(2*na-2))*2;const posn=[6];for(let p=n-7;posn.length<na;p-=step)posn.splice(1,0,p);
  for(const a of posn)for(const b of posn){if(m[a][b]!==null)continue;for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)set(a+i,b+j,Math.max(Math.abs(i),Math.abs(j))!==1);}}
 for(let i=0;i<9;i++){if(m[8][i]===null)m[8][i]=0;if(m[i][8]===null)m[i][8]=0;}
 for(let i=0;i<8;i++){if(m[8][n-1-i]===null)m[8][n-1-i]=0;if(m[n-1-i][8]===null)m[n-1-i][8]=0;}
 m[n-8][8]=1;
 const func=m.map(r=>r.map(v=>v!==null));
 let bi=0;const db=[];out.forEach(b=>{for(let i=7;i>=0;i--)db.push((b>>i)&1);});
 for(let right=n-1;right>=1;right-=2){if(right===6)right=5;for(let v=0;v<n;v++){for(let j=0;j<2;j++){const c=right-j;const up=((right+1)&2)===0;const r=up?n-1-v:v;if(!func[r][c]){m[r][c]=db[bi++]||0;}}}}
 const masks=[(r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>(r*c)%2+(r*c)%3===0,(r,c)=>((r*c)%2+(r*c)%3)%2===0,(r,c)=>((r+c)%2+(r*c)%3)%2===0];
 function fmt(mk){const d=(FMTL<<3)|mk;let rem=d;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);const f=((d<<10)|rem)^0x5412;const g=i=>(f>>i)&1;
  for(let i=0;i<=5;i++)m[i][8]=g(i);m[7][8]=g(6);m[8][8]=g(7);m[8][7]=g(8);for(let i=9;i<15;i++)m[8][14-i]=g(i);
  for(let i=0;i<8;i++)m[8][n-1-i]=g(i);for(let i=8;i<15;i++)m[n-15+i][8]=g(i);m[n-8][8]=1;}
 function penalty(){let p=0;for(let r=0;r<n;r++){let run=1;for(let c=1;c<n;c++){if(m[r][c]===m[r][c-1]){run++;if(run===5)p+=3;else if(run>5)p++;}else run=1;}}
  for(let c=0;c<n;c++){let run=1;for(let r=1;r<n;r++){if(m[r][c]===m[r-1][c]){run++;if(run===5)p+=3;else if(run>5)p++;}else run=1;}}
  for(let r=0;r<n-1;r++)for(let c=0;c<n-1;c++){const v=m[r][c];if(v===m[r][c+1]&&v===m[r+1][c]&&v===m[r+1][c+1])p+=3;}
  let dark=0;m.forEach(r=>r.forEach(v=>dark+=v));p+=Math.floor(Math.abs(dark*20-n*n*10)/(n*n))*10;return p;}
 let best=null,bp=1e9;
 for(let mk=0;mk<8;mk++){for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(!func[r][c]&&masks[mk](r,c))m[r][c]^=1;fmt(mk);const p=penalty();if(p<bp){bp=p;best=m.map(r=>r.slice());}
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(!func[r][c]&&masks[mk](r,c))m[r][c]^=1;}
 return best;
}

const __qrCache={};
export function qrDataUrl(text,scale=8,pad=2){
 if(__qrCache[text])return __qrCache[text];
 const M=qrMatrix(text),n=M.length,S=(n+pad*2)*scale;
 const cv=document.createElement('canvas');cv.width=S;cv.height=S;const ctx=cv.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,S,S);ctx.fillStyle='#000';
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(M[r][c])ctx.fillRect((c+pad)*scale,(r+pad)*scale,scale,scale);
 return __qrCache[text]=cv.toDataURL('image/png');
}

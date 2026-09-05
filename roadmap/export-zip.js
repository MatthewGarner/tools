/* PNGs are already compressed. A stored ZIP makes a slide set one reliable
   download instead of a series of downloads that browsers may silently block. */
const encoder = new TextEncoder();
const table = Uint32Array.from({length:256}, (_, n) => {
  for(let bit=0;bit<8;bit++) n = n&1 ? 0xedb88320^(n>>>1) : n>>>1;
  return n>>>0;
});
export function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function record(size){
  const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
  return {bytes,u16:(at,value)=>view.setUint16(at,value,true),u32:(at,value)=>view.setUint32(at,value,true)};
}
export function createSlideZip(files){
  if(!files.length || files.length>65535)throw new Error('A slide ZIP needs 1–65535 files.');
  const body=[],directory=[],names=new Set();let offset=0,directorySize=0;
  for(const file of files){
    if(!file.name || /[\\/\0]/.test(file.name) || names.has(file.name))throw new Error('Slide filenames must be unique basenames.');
    names.add(file.name);
    const name=encoder.encode(file.name),data=file.bytes;
    if(!(data instanceof Uint8Array) || name.length>65535 || data.length>0xffffffff)throw new Error('Invalid slide ZIP entry.');
    const crc=crc32(data),local=record(30),central=record(46);
    local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x800);local.u16(12,33);
    local.u32(14,crc);local.u32(18,data.length);local.u32(22,data.length);local.u16(26,name.length);
    central.u32(0,0x02014b50);central.u16(4,20);central.u16(6,20);central.u16(8,0x800);central.u16(14,33);
    central.u32(16,crc);central.u32(20,data.length);central.u32(24,data.length);central.u16(28,name.length);central.u32(42,offset);
    body.push(local.bytes,name,data);directory.push(central.bytes,name);
    offset+=30+name.length+data.length;directorySize+=46+name.length;
    if(offset+directorySize>0xffffffff)throw new Error('The slide ZIP exceeds 4 GB.');
  }
  const end=record(22);end.u32(0,0x06054b50);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,directorySize);end.u32(16,offset);
  return new Blob([...body,...directory,end.bytes],{type:'application/zip'});
}

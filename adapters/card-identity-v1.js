/* Pure identity matching for the standalone Assessment library.
   NO network, no scraping, no Discover catalog and no user-answer transport. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.NextBonusCardIdentityV1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1';
  const GENERIC=new Set(['gold','platinum','blue','silver','green','black',
    'business','cash','travel','premier','preferred','ventureone','savor','quicksilver']);
  function normalize(value){
    return String(value||'').normalize('NFKC').toLowerCase()
      .replace(/&/g,' and ').replace(/[^a-z0-9\u4e00-\u9fff]+/g,' ')
      .trim().replace(/\s+/g,' ');
  }
  function usableUrl(value){
    if(!/^https?:\/\//i.test(value))return null;
    try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?url:null;}
    catch{return null;}
  }
  function urlKey(value){
    const url=usableUrl(value);if(!url)return null;
    const path=url.pathname.replace(/\/+$/,'')||'/';
    return url.origin.toLowerCase()+path;
  }
  function slugFromUrl(value){
    const url=usableUrl(value);if(!url)return null;
    let tail=url.pathname.split('/').filter(Boolean).pop()||'';
    try{tail=decodeURIComponent(tail);}catch{return null;}
    return tail.replace(/\.(?:html?|php)$/i,'')
      .replace(/(?:-credit-card-review|-card-review|-credit-card|-review|-intro|-bonus|-offer|-apply)$/i,'')
      .replace(/[-_]+/g,' ');
  }
  const catalogOnly=new Set(['REVIEWED_PRODUCT','EXPANSION_CANDIDATE','HISTORY_ONLY','NB_FORMAL_CATALOG']);
  function createLookup(index){
    if(index?.schema_version!=='1'||!Number.isSafeInteger(index?.count)||
       index.count<98||!Array.isArray(index.products)||
       index.products.length!==index.count)
      throw Error('Complete and versioned standalone card identity index required');
    const byId=new Map(),aliases=new Map(),directUrls=new Map();
    for(const p of index.products){
      if(!p?.product_id||byId.has(p.product_id)||!catalogOnly.has(p.identity_source))
        throw Error('Invalid or duplicate product identity');
      byId.set(p.product_id,p);
      for(const name of p.aliases||[]){
        const key=normalize(name);if(!key)continue;
        if(!aliases.has(key))aliases.set(key,[]);
        if(!aliases.get(key).includes(p.product_id))aliases.get(key).push(p.product_id);
      }
      for(const u of [p.article_url,p.application_url].filter(Boolean)){
        const key=urlKey(u);
        if(!key)continue;
        if(!directUrls.has(key))directUrls.set(key,[]);
        directUrls.get(key).push(p.product_id);
      }
    }
    function describe(p){return {product_id:p.product_id,name:p.name,
      issuer:p.issuer,customer_type:p.customer_type,identity_source:p.identity_source,
      offer_timing_id:p.offer_timing_id};}
    function findById(id){return byId.get(id)||null;}
    function suggestions(query,{issuer,limit=10}={}){
      const needle=normalize(slugFromUrl(String(query||''))||query);
      if(needle.length<2)return [];
      const parts=needle.split(' ').filter(Boolean);
      const found=[...byId.values()].filter(p=>
        (!issuer||p.issuer===issuer) &&
        (p.aliases||[]).some(a=>{
          const key=normalize(a);return key.includes(needle)||
            (parts.length>1&&parts.every(part=>key.split(' ').includes(part)));
        }))
      .sort((a,b)=>{
        const as=normalize(a.name).startsWith(needle)?0:1;
        const bs=normalize(b.name).startsWith(needle)?0:1;
        return as-bs||a.name.localeCompare(b.name);
      });
      return found.slice(0,Math.min(20,Math.max(1,limit))).map(describe);
    }
    function resolve({input,issuer}={}){
      const original=String(input||'').trim();
      if(!original||original.length>2048)return {status:'INVALID_INPUT',candidates:[]};
      const looksLikeUrl=/^[a-z][a-z0-9+.-]*:/i.test(original);
      const url=usableUrl(original);
      if(looksLikeUrl&&!url)return {status:'INVALID_INPUT',candidates:[]};
      let ids=[],isVerifiedUrl=false,key;
      if(url){
        ids=directUrls.get(urlKey(original))||[];
        isVerifiedUrl=ids.length>0;
        key=normalize(slugFromUrl(original));
      }else key=normalize(original);
      if(!ids.length)ids=aliases.get(key)||[];
      if(issuer)ids=ids.filter(id=>byId.get(id)?.issuer===issuer);
      const matched=ids.map(id=>byId.get(id));
      if(matched.length===1){
        const p=matched[0];
        // Short, generic labels cannot establish an issuer or product,
        // even when a historical catalog happens to contain one match.
        const unqualified=(url&&!isVerifiedUrl)||
          (!isVerifiedUrl&&(GENERIC.has(key)||key.split(' ').length===1&&key.length<8));
        if(unqualified||!p.issuer)return {status:'NEEDS_CONFIRMATION',
          candidates:[describe(p)],suggestions:suggestions(key,{issuer})};
        return {status:'MATCHED',product:describe(p),candidates:[]};
      }
      if(matched.length>1)return {status:'AMBIGUOUS',
        candidates:matched.map(describe)};
      return {status:'NOT_FOUND',candidates:[],
        suggestions:suggestions(key,{issuer})};
    }
    return Object.freeze({getVersion:()=>({contract_version:VERSION,count:byId.size}),
      findById,resolve,suggestions,list:()=>[...byId.values()].map(describe)});
  }
  return Object.freeze({contractVersion:VERSION,normalize,createLookup,slugFromUrl,urlKey});
});
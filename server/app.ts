import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './db.ts';
import { Budget } from './budget.ts';
import { TextAI, replySchema, feedbackSchema, instructions, type AIConfig } from './ai.ts';
import { VoiceManager } from './voice.ts';
import { profileSchema, packageSchema, youtubeId, reviewNext, now, type Profile, type Material, type PracticeSession, type ReviewItem } from '../shared/domain.ts';
import { packs, phrases } from '../shared/content.ts';
export type AppConfig = AIConfig & { password: string; cliToken?: string; origin?: string; monthlyBudget: number; usdJpy: number };
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const same=(a:string,b:string)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const str=z.string().min(1).max(2000);
export function createApp(store: Store, config: AppConfig, fetcher: typeof fetch = fetch) {
  const app = new Hono(); const budget = new Budget(store, config.monthlyBudget,config.usdJpy); const ai=new TextAI(config,budget,fetcher); const voice=new VoiceManager(store,budget,config,fetcher);
  const attempts=new Map<string,{count:number,at:number}>();
  const locks=new Set<string>();
  const getSession=(id:string)=>{const s=store.get<PracticeSession>('session',id);if(!s)throw new Error('会話が見つかりません');return s;};
  const getMaterial=(id:string)=>{const m=store.get<Material>('material',id);if(!m)throw new Error('教材が見つかりません');return m;};
  const profile=()=>store.get<Profile>('profile','self')!;
  async function operation<T>(key:string|undefined,run:()=>Promise<T>) {
    if(!key||!z.string().uuid().safeParse(key).success)throw new Error('処理IDが必要です');
    const existing=store.get<{status:string,result?:T}>('operation',key);
    if(existing){if(existing.status==='done')return existing.result!;throw new Error('この処理は実行中または結果未確認です。自動再送はしません');}
    store.put('operation',key,{status:'pending'});
    try{const result=await run();store.put('operation',key,{status:'done',result});return result;}catch(e){store.put('operation',key,{status:'unknown'});throw e;}
  }
  async function sessionLock<T>(id:string,run:()=>Promise<T>) {if(locks.has(id))throw new Error('会話を処理中です');locks.add(id);try{return await run();}finally{locks.delete(id);}}
  app.onError((error,c)=> { if(error instanceof z.ZodError)return c.json({error:'入力内容・形式を確認してください',issues:error.issues.map(i=>({path:i.path,message:i.message}))},400); return c.json({error: error.message.startsWith('SQLITE')?'データ保存に失敗しました':error.message},400); });
  app.use('/api/*',bodyLimit({maxSize:30*1024*1024,onError:c=>c.json({error:'ファイルは30MB以下にしてください'},413)}));
  app.use('/api/*',async(c,next)=>{
    c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','same-origin');
    if(!['GET','HEAD','OPTIONS'].includes(c.req.method)) {
      if(c.req.header('X-Lab-Request')!=='1')return c.json({error:'リクエストを確認できません'},403);
      const origin=c.req.header('Origin');
      const validOrigins=new Set([new URL(c.req.url).origin,'http://127.0.0.1:5173','http://localhost:5173',config.origin].filter(Boolean));
      if(origin&&!validOrigins.has(origin))return c.json({error:'別のサイトからは操作できません'},403);
    }
    if(c.req.path==='/api/login')return next();
    const cookie=getCookie(c,'lab_session'); const cli=c.req.header('Authorization');
    const login=cookie?store.db.prepare('SELECT expires FROM logins WHERE token=?').get(hash(cookie)) as {expires:number}|undefined:undefined;
    if(!(login&&login.expires>Date.now())&&!(config.cliToken&&cli&&same(cli,`Bearer ${config.cliToken}`)))return c.json({error:'ログインしてください'},401);
    await next();
  });
  app.post('/api/login',async c=>{
    const key=c.req.header('x-forwarded-for')||'local';let a=attempts.get(key); if(a&&Date.now()-a.at>900000){attempts.delete(key);a=undefined;}
    if(a&&a.count>=10)return c.json({error:'15分後に再試行してください'},429);
    const {password}=z.object({password:z.string().max(512)}).parse(await c.req.json());
    if(!same(password,config.password)){attempts.set(key,{count:(a?.count||0)+1,at:a?.at||Date.now()});return c.json({error:'パスワードを確認してください'},401);}
    attempts.delete(key); const token=randomBytes(32).toString('base64url'); const expires=Date.now()+12*3600000;
    store.db.prepare('DELETE FROM logins WHERE expires<?').run(Date.now());store.db.prepare('INSERT INTO logins VALUES(?,?)').run(hash(token),expires);
    setCookie(c,'lab_session',token,{httpOnly:true,sameSite:'Strict',secure:config.origin?.startsWith('https:')||new URL(c.req.url).protocol==='https:',path:'/',maxAge:12*3600});return c.json({ok:true});
  });
  app.post('/api/logout',async c=>{await voice.close();const cookie=getCookie(c,'lab_session');if(cookie)store.db.prepare('DELETE FROM logins WHERE token=?').run(hash(cookie));deleteCookie(c,'lab_session',{path:'/'});return c.json({ok:true});});
  const connections=()=>({ provider:config.provider, text:config.provider==='simulator'||!!config.apiKey, voice:config.provider==='openai'&&!!config.apiKey, textModel:config.textModel, voiceModel:config.voiceModel, chatgpt:{available:false,reason:'ホスト版への適用条件・認可・疎通が未確認です'}, simulator:config.provider==='simulator' });
  app.get('/api/bootstrap',c=>c.json({profile:profile(),materials:store.all<Material>('material'),sessions:store.all<PracticeSession>('session'),review:store.all<ReviewItem>('review'),packs,phrases,usage:budget.snapshot(),connections:connections(),jobs:store.all('job')}));
  app.get('/api/catalog',c=>c.json({materials:store.all<Material>('material'),packs}));
  app.get('/api/usage',c=>c.json(budget.snapshot()));app.get('/api/ai-connections',c=>c.json(connections()));
  app.post('/api/ai-connections/check',async c=>{
    if(config.provider==='simulator')return c.json({ok:true,message:'検証モードです。実AIには接続していません。'});
    if(!config.apiKey)return c.json({error:'OPENAI_API_KEY が未設定です'},400);
    const r=await fetcher(`https://api.openai.com/v1/models/${encodeURIComponent(config.textModel)}`,{headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(10000)});
    return c.json({ok:r.ok,message:r.ok?'モデルへのアクセスを確認しました。音声疎通は会話開始時に確認します。':`接続に失敗しました (${r.status})`});
  });
  app.put('/api/profile',async c=>{const p=profileSchema.parse(await c.req.json());store.put('profile','self',p);return c.json(p);});
  app.post('/api/materials',async c=>{
    const input=z.object({title:str,url:z.string().url(),topic:z.enum(['AI','SRE','データ基盤','その他']),reason:z.string().max(2000).default(''),year:z.number().int().min(2000).max(2100).optional()}).parse(await c.req.json());
    const id=youtubeId(input.url);if(!id)throw new Error('https のYouTube動画URLを指定してください');
    const m:Material={...input,id:randomUUID(),youtubeId:id,difficulty:'未評価',status:'awaiting_source',offsetMs:0,positionMs:0};store.put('material',m.id,m);return c.json(m,201);
  });
  app.patch('/api/materials/:id',async c=>{
    const m=getMaterial(c.req.param('id')); const p=z.object({positionMs:z.number().int().min(0).max(86400000).optional(),offsetMs:z.number().int().min(-3600000).max(3600000).optional()}).parse(await c.req.json());store.put('material',m.id,{...m,...p});return c.json({...m,...p});
  });
  app.post('/api/materials/:id/subtitle-packages',async c=>{
    const m=getMaterial(c.req.param('id'));const p=packageSchema.parse(await c.req.json());if(p.sourceUrl!==m.url)throw new Error('字幕パッケージと教材の元URLが一致しません');
    m.captions=p;m.status='ready';store.put('material',m.id,m);return c.json(m);
  });
  app.post('/api/materials/:id/translations',async c=>{
    const m=getMaterial(c.req.param('id'));if(!m.captions)throw new Error('字幕がありません');
    const {cueIds}=z.object({cueIds:z.array(z.string()).min(1).max(20)}).parse(await c.req.json());
    const pending=m.captions.cues.filter(q=>cueIds.includes(q.cueId)&&!q.translation);if(!pending.length)return c.json(m);
    return c.json(await operation(c.req.header('Idempotency-Key'),async()=>{
      const schema=z.object({translations:z.array(z.object({cueId:z.string(),ja:z.string().min(1).max(6000)})).max(20)});
      const result=await ai.json('translation','Translate the English cues into Japanese. Preserve technical terms and never add facts. Return {translations:[{cueId,ja}]}.',pending,schema,{translations:pending.map(q=>({cueId:q.cueId,ja:`［検証用の訳］${q.originalText}`}))});
      if(pending.some(q=>!result.translations.find(t=>t.cueId===q.cueId)))throw new Error('翻訳が一部不足しています');
      const latest=getMaterial(m.id);latest.captions!.cues=latest.captions!.cues.map(q=>({...q,translation:result.translations.find(t=>t.cueId===q.cueId)?.ja||q.translation}));store.put('material',m.id,latest);return latest;
    }));
  });
  app.post('/api/explain',async c=>{const {text}=z.object({text:str}).parse(await c.req.json());return c.json(await operation(c.req.header('Idempotency-Key'),()=>ai.json('explain','Explain the English technical phrase in Japanese in 2 sentences. Return {text}.',{text},replySchema,{text:'検証モードの用語説明です。実際の意味の解説にはOpenAI接続を設定してください。'})));});
  app.post('/api/practice-sessions',async c=>{
    const p=z.object({mode:z.enum(['企業デモ','AWS技術相談','技術トレンド','ネットワーキング','動画から会話','旅行練習']),goal:str,packId:z.string().max(100),materialId:z.string().optional(),training:z.boolean().default(true)}).parse(await c.req.json());
    if(!packs.some(x=>x.id===p.packId))throw new Error('相手を選択してください');
    const material=p.materialId?getMaterial(p.materialId):undefined;
    const s:PracticeSession={...p,id:randomUUID(),status:'ready',provider:config.provider,createdAt:now(),turns:[],hintCount:0,materialVersion:material?.captions?.inputHash};store.put('session',s.id,s);return c.json(s,201);
  });
  app.get('/api/practice-sessions/:id',c=>c.json(getSession(c.req.param('id'))));
  app.post('/api/practice-sessions/:id/turns',async c=>{
    const id=c.req.param('id');const {text}=z.object({text:str}).parse(await c.req.json());
    return c.json(await sessionLock(id,()=>operation(c.req.header('Idempotency-Key'),async()=>{
      const s=getSession(id);if(s.status!=='ready')throw new Error('テキスト会話を開始できない状態です');
      const user={id:randomUUID(),role:'user' as const,text,at:now()};s.turns.push(user);store.put('session',id,s);
      const reply=await ai.json('roleplay',instructions(s,profile())+' Return {text}.',s.turns.slice(-30),replySchema,{text:s.turns.length<3?'Hi! What would you like to learn about today?':/again|slow|repeat/i.test(text)?'Of course. Let me put it another way. What part would you like me to explain?':/thank|bye/i.test(text)?'You are welcome. Enjoy the rest of the conference!':'That is a useful question. I cannot verify the product details from these materials. What would you ask the real team?'});
      s.turns.push({id:randomUUID(),role:'assistant',text:reply.text,at:now(),heard:true});store.put('session',id,s);return s;
    })));
  });
  app.post('/api/practice-sessions/:id/hint',async c=>{
    const id=c.req.param('id');const {text}=z.object({text:str}).parse(await c.req.json());return c.json(await sessionLock(id,()=>operation(c.req.header('Idempotency-Key'),async()=>{
      const s=getSession(id);const reply=await ai.json('hint','Convert the learner intent into a short English question, with a brief Japanese explanation. Return {text}.',{intent:text},replySchema,{text:'Could you explain that with an example? — 例を使って説明してもらえますか？'});s.hintCount++;store.put('session',id,s);return reply;
    })));
  });
  app.post('/api/practice-sessions/:id/voice',async c=>{
    if(config.provider!=='openai')throw new Error('検証モードでは実音声AIに接続しません。テキスト会話をご利用ください');
    const id=c.req.param('id');const {sdp}=z.object({sdp:z.string().min(10).max(64000)}).parse(await c.req.json());
    return c.json(await sessionLock(id,async()=>{const s=getSession(id);if(s.status!=='ready')throw new Error('この会話は音声接続できません。新しい会話を開始してください');return voice.start(id,sdp,profile());}));
  });
  app.post('/api/practice-sessions/:id/heartbeat',c=>{voice.heartbeat(c.req.param('id'));return c.json({ok:true});});
  app.post('/api/practice-sessions/:id/stop',async c=>{await voice.stop(c.req.param('id'),true);return c.json(getSession(c.req.param('id')));});
  app.post('/api/practice-sessions/:id/finish',async c=>{
    const id=c.req.param('id');return c.json(await sessionLock(id,async()=>{
      await voice.stop(id);const s=getSession(id);if(s.feedback)return s;if(!s.turns.some(t=>t.role==='user'))throw new Error('発話を残してから振り返りを作成してください');
      return operation(c.req.header('Idempotency-Key'),async()=>{
        const user=s.turns.find(t=>t.role==='user')!;
        s.feedback=await ai.json('feedback','Give feedback in Japanese based only on transcript evidence. Never grade pronunciation or infer CEFR. Exclude unplayed assistant text (heard=false). Max 3 improvements. Return {positive,improvements:[],expressions:[{en,ja,turnId}],goal,achieved}. Use actual turn IDs. Distinguish intent from correctness. If simulator, do not make real competence claims.',{goal:s.goal,hintCount:s.hintCount,turns:s.turns.filter(t=>t.role==='user'||t.heard)},feedbackSchema,{positive:'会話の操作を最後まで試せました。これは検証用の講評です。',improvements:['実際の英語の評価にはOpenAI接続を設定してください。'],expressions:[{en:'Could you explain the last part again?',ja:'最後の部分をもう一度説明してください',turnId:user.id}],goal:s.goal,achieved:false});
        s.feedback.expressions=s.feedback.expressions.filter(e=>s.turns.some(t=>t.id===e.turnId&&t.role==='user'));s.status='completed';s.endedAt=now();store.put('session',id,s);return s;
      });
    }));
  });
  app.patch('/api/practice-sessions/:id/turns/:turn',async c=>{const s=getSession(c.req.param('id'));const {text}=z.object({text:str}).parse(await c.req.json());if(s.status==='active'||locks.has(s.id))throw new Error('会話を終了してから修正してください');s.turns=s.turns.map(t=>t.id===c.req.param('turn')&&t.role==='user'?{...t,text}:t);s.feedback=undefined;store.put('session',s.id,s);return c.json(s);});
  app.get('/api/review-items',c=>c.json(store.all<ReviewItem>('review')));
  app.post('/api/review-items',async c=>{
    const p=z.object({en:str,ja:str,source:z.object({kind:z.enum(['phrase','material','session']),id:z.string().max(100),cueId:z.string().max(100).optional(),turnId:z.string().max(100).optional(),positionMs:z.number().nonnegative().optional()})}).parse(await c.req.json());
    const key=hash(JSON.stringify([p.en,p.source]));const existing=store.get<ReviewItem>('review',key);if(existing)return c.json(existing);
    const item:ReviewItem={...p,id:key,dueAt:now(),stage:0,attempts:[]};store.put('review',key,item);return c.json(item,201);
  });
  app.post('/api/review-items/:id/attempts',async c=>{
    const {remembered}=z.object({remembered:z.boolean()}).parse(await c.req.json());return c.json(await operation(c.req.header('Idempotency-Key'),async()=>{const item=store.get<ReviewItem>('review',c.req.param('id'));if(!item)throw new Error('カードが見つかりません');const next=reviewNext(item,remembered);store.put('review',item.id,next);return next;}));
  });
  app.delete('/api/practice-sessions/:id',async c=>{const id=c.req.param('id');if(locks.has(id))throw new Error('処理完了後に削除してください');await voice.stop(id,true);store.remove('session',id);for(const r of store.all<ReviewItem>('review'))if(r.source.kind==='session'&&r.source.id===id)store.remove('review',r.id);return c.json({ok:true});});
  app.delete('/api/history',async c=>{if(locks.size)throw new Error('処理完了後に削除してください');await voice.close();store.db.prepare("DELETE FROM records WHERE kind IN ('session','review','operation','voice-accounting')").run();return c.json({ok:true});});
  app.post('/api/materials/:id/preparation-jobs',async c=>{
    getMaterial(c.req.param('id'));const p=z.object({sourceDescription:str,permission:str,inputHash:z.string().min(1).max(128),startMs:z.number().int().nonnegative(),durationMs:z.number().int().positive().max(14400000),settings:z.record(z.string(),z.unknown())}).parse(await c.req.json());
    const existing=store.all<any>('job').find(j=>j.materialId===c.req.param('id')&&j.inputHash===p.inputHash&&JSON.stringify(j.settings)===JSON.stringify(p.settings)&&j.startMs===p.startMs&&j.durationMs===p.durationMs);
    if(existing)return c.json(existing);const job={...p,id:randomUUID(),materialId:c.req.param('id'),status:'queued',steps:{},createdAt:now(),updatedAt:now()};store.put('job',job.id,job);return c.json(job,201);
  });
  app.get('/api/preparation-jobs/:id',c=>{const job=store.get('job',c.req.param('id'));if(!job)throw new Error('ジョブがありません');return c.json(job);});
  app.patch('/api/preparation-jobs/:id',async c=>{
    const job=store.get<any>('job',c.req.param('id'));if(!job)throw new Error('ジョブがありません');const p=z.object({status:z.enum(['extracting','transcribing','aligning','translating','validating','ready','failed','cancelled']),steps:z.record(z.string(),z.unknown()).optional(),failure:z.string().max(1000).optional(),deletedAudio:z.boolean().optional()}).parse(await c.req.json());store.put('job',job.id,{...job,...p,updatedAt:now()});return c.json({...job,...p});
  });
  // CLI requests are authenticated and share the same server budget. Raw audio stays in memory only.
  app.post('/api/preparation-jobs/:id/transcribe',async c=>{
    const job=store.get<any>('job',c.req.param('id'));if(!job)throw new Error('ジョブがありません');
    if(config.provider!=='openai'||!config.apiKey)throw new Error('教材のSTTにはOpenAI接続が必要です');
    const form=await c.req.formData();const file=form.get('file');const duration=Number(form.get('duration'));if(!(file instanceof File)||file.size>24*1024*1024||!Number.isFinite(duration)||duration<=0||duration>600)throw new Error('音声ファイル・長さを確認してください');
    return c.json(await operation(c.req.header('Idempotency-Key'),async()=>{
      const rid=budget.reserve('transcription','whisper-1',duration/60*.006*config.usdJpy*1.2);
      const body=new FormData();body.set('file',file);body.set('model','whisper-1');body.set('language','en');body.set('response_format','verbose_json');body.append('timestamp_granularities[]','segment');body.set('prompt','AWS, re:Invent, SRE, Databricks, Confluent, Kafka, observability');
      const r=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`},body,signal:AbortSignal.timeout(120000)});
      if(!r.ok){if([400,401,403,404,429].includes(r.status))budget.release(rid);throw new Error(`STTに失敗しました (${r.status})`);}
      const data=await r.json() as any;if(!Number.isFinite(data.duration)||!Array.isArray(data.segments))throw new Error('STTの時刻情報が不足しています');budget.confirm(rid,data.duration/60*.006,{duration:data.duration,rateDate:'2026-11-17',model:'whisper-1'});return data;
    }));
  });
  app.post('/api/preparation-jobs/:id/translate',async c=>{
    const job=store.get('job',c.req.param('id'));if(!job)throw new Error('ジョブがありません');const input=z.object({cues:z.array(z.object({cueId:z.string().max(100),text:z.string().max(3000)})).min(1).max(20)}).parse(await c.req.json());
    return c.json(await operation(c.req.header('Idempotency-Key'),()=>ai.json('translation','Translate English subtitles into Japanese with AWS terminology. Do not add information. Return {translations:[{cueId,ja}]}.',input,z.object({translations:z.array(z.object({cueId:z.string(),ja:z.string().max(6000)}))}),{translations:input.cues.map(q=>({cueId:q.cueId,ja:`［検証用の訳］${q.text}`}))})));
  });
  return { app, store, budget, voice, config };
}

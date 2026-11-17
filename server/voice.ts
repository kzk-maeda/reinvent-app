import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { Store } from './db.ts';
import { Budget } from './budget.ts';
import { instructions, type AIConfig } from './ai.ts';
import { now, type PracticeSession, type Profile } from '../shared/domain.ts';
type Call = { callId: string; reservation: string; socket?: WebSocket; timer?: ReturnType<typeof setTimeout>; heartbeat?: ReturnType<typeof setTimeout>; responseIds: Set<string>; usd: number; uncertain: boolean; closing: boolean; lastActivity: number };
export class VoiceManager {
  calls = new Map<string, Call>();
  constructor(readonly store: Store, readonly budget: Budget, readonly config: AIConfig, readonly fetcher: typeof fetch = fetch) {}
  getSession(id: string) { return this.store.get<PracticeSession>('session', id)!; }
  update(id: string, update: Partial<PracticeSession>) { const s = this.getSession(id); if (s) this.store.put('session',id,{ ...s,...update }); }
  async start(id: string, sdp: string, profile: Profile) {
    if (!this.config.apiKey || this.config.voiceModel !== 'gpt-realtime') throw new Error('音声APIキーまたは検証済みモデルの設定を確認してください');
    if (this.calls.size || this.store.all<PracticeSession>('session').some(s=> s.id !== id && ['active','connecting'].includes(s.status))) throw new Error('音声は同時に1接続までです');
    const reservation = this.budget.reserve('voice',this.config.voiceModel,this.config.voiceReservationYen);
    const call: Call = { callId: '', reservation, responseIds: new Set(), usd: 0, uncertain: false, closing: false, lastActivity: Date.now() };
    this.calls.set(id,call); this.update(id,{ status:'connecting' });
    try {
      const body = new FormData(); body.set('sdp',sdp); body.set('session',JSON.stringify({ type:'realtime', model:this.config.voiceModel, instructions: instructions(this.getSession(id),profile), max_output_tokens:600, audio:{ input:{ transcription:{model:'whisper-1',language:'en'}, turn_detection:{type:'server_vad',silence_duration_ms:1200,create_response:true,interrupt_response:true} },output:{voice:'marin',speed:profile.speed} } }));
      const result = await this.fetcher('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${this.config.apiKey}`},body,signal:AbortSignal.timeout(20000)});
      if (!result.ok) { if ([400,401,403,404,429].includes(result.status)) this.budget.release(reservation); throw new Error('音声APIへ接続できませんでした'); }
      const location = result.headers.get('location') || ''; const callId = location.split('/').at(-1) || '';
      if (!/^rtc_[\w-]+$/.test(callId)) throw new Error('音声接続IDを確認できませんでした');
      call.callId=callId;
      const answer=await result.text();
      await new Promise<void>((resolve,reject)=>{
        const socket = new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`,{headers:{Authorization:`Bearer ${this.config.apiKey}`}}); call.socket=socket;
        const timeout=setTimeout(()=>reject(new Error('音声のサーバー監視接続に失敗しました')),10000);
        socket.on('error',()=>{clearTimeout(timeout);call.uncertain=true;reject(new Error('音声の監視接続が切断されました'));void this.stop(id,true);});
        socket.on('close',()=>{if(!call.closing){call.uncertain=true;void this.stop(id,true);}});
        socket.on('message',raw=>{try{this.event(id,JSON.parse(raw.toString()));}catch{call.uncertain=true;void this.stop(id,true);}});
        socket.on('open',()=>{clearTimeout(timeout);resolve();});
      });
      this.update(id,{status:'active'});
      call.timer=setTimeout(()=>void this.stop(id,true),this.config.maxSeconds*1000);
      call.heartbeat=setInterval(()=>{if(Date.now()-call.lastActivity>90000)void this.stop(id,true);},5000);
      return { sdp:answer, maxSeconds:this.config.maxSeconds };
    } catch (error) { call.uncertain=true; await this.stop(id,true); throw error; }
  }
  event(id: string, event: any) {
    const call=this.calls.get(id); if (!call) return;
    const s=this.getSession(id); if(!s)return;
    if(event.type==='input_audio_buffer.speech_started')call.lastActivity=Date.now();
    if(event.type==='conversation.item.input_audio_transcription.completed'||event.type==='response.output_audio_transcript.done') {
      const tid=event.item_id || randomUUID(); const text=event.transcript;
      if(typeof text==='string'&&!s.turns.some(t=>t.id===tid)) { s.turns.push({id:tid,role:event.type.startsWith('conversation')?'user':'assistant',text,at:now(),heard:event.type.startsWith('conversation')});this.store.put('session',id,s); }
    }
    if(event.type==='conversation.item.truncated') { s.turns=s.turns.map(t=>t.id===event.item_id?{...t,heard:false}:t); this.store.put('session',id,s); }
    if(event.type==='response.done' && !call.responseIds.has(event.response.id)) {
      call.responseIds.add(event.response.id); const u=event.response.usage;
      if(!u){call.uncertain=true;return;}
      const i=u.input_token_details||{},o=u.output_token_details||{};
      if (![u.input_tokens,u.output_tokens].every(Number.isFinite)) {call.uncertain=true;return;}
      // gpt-realtime: text $4/$16, audio $32/$64 per 1M tokens. Cached input is conservatively charged at full rate.
      call.usd+=((i.text_tokens||0)*4+(i.audio_tokens||0)*32+(o.text_tokens||0)*16+(o.audio_tokens||0)*64)/1e6;
      if(call.usd*this.budget.usdJpy>this.config.voiceReservationYen*.8)void this.stop(id,true);
    }
    if(event.type==='error') {call.uncertain=true;void this.stop(id,true);}
  }
  heartbeat(id:string) {const call=this.calls.get(id);if(call)call.lastActivity=Date.now();}
  async stop(id:string,interrupted=false) {
    const call=this.calls.get(id); if(!call||call.closing)return;
    call.closing=true; clearTimeout(call.timer); clearInterval(call.heartbeat);
    let stopped=!call.callId;
    if(call.callId) {try {const result=await this.fetcher(`https://api.openai.com/v1/realtime/calls/${call.callId}/hangup`,{method:'POST',headers:{Authorization:`Bearer ${this.config.apiKey}`},signal:AbortSignal.timeout(10000)});stopped=result.ok||result.status===404;}catch{call.uncertain=true;}}
    call.socket?.close();
    // Transcription is billed separately; retain the conservative reservation until verified server-side accounting is available.
    if(stopped&&!call.uncertain&&call.responseIds.size) this.store.put('voice-accounting',id,{estimatedUsd:call.usd,reservation:call.reservation,reason:'音声入力の文字起こし費用を含む最終請求は未確定。予約を保持。'});
    this.update(id,{status:interrupted||!stopped?'interrupted':'ready'});this.calls.delete(id);
  }
  async close(){await Promise.all([...this.calls.keys()].map(id=>this.stop(id,true)));}
}

import type{ApplicationStage}from'@career-launch/shared'
export const stageMeta:Record<ApplicationStage,{label:string;tone:'neutral'|'primary'|'success'|'warning'|'danger'}>={pending_confirmation:{label:'待确认',tone:'warning'},applied:{label:'已投递',tone:'primary'},written_test:{label:'笔试',tone:'primary'},interview:{label:'面试',tone:'warning'},offer:{label:'Offer',tone:'success'},rejected:{label:'未通过',tone:'danger'},closed:{label:'已结束',tone:'neutral'}}
const terminal=new Set<ApplicationStage>(['offer','rejected','closed'])
export function canTransition(from:ApplicationStage,to:ApplicationStage):boolean{return from===to||!terminal.has(from)}

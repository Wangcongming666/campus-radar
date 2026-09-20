import type{Resume}from'@career-launch/shared'
export interface ResumeValidationError{path:string;message:string}
export interface ResumeValidation{valid:boolean;errors:ResumeValidationError[]}
export function validateResume(resume:Resume):ResumeValidation{const errors:ResumeValidationError[]=[];if(!resume.profile.name.trim())errors.push({path:'profile.name',message:'请填写姓名'});if(!/^\S+@\S+\.\S+$/.test(resume.profile.email))errors.push({path:'profile.email',message:'请填写有效邮箱'});if(!resume.profile.phone.trim())errors.push({path:'profile.phone',message:'请填写联系电话'});if(!resume.education.length)errors.push({path:'education',message:'请至少填写一段教育经历'});return{valid:errors.length===0,errors}}

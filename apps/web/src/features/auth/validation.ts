export function validateEmail(value:string):string|null{return /^\S+@\S+\.\S+$/.test(value.trim())?null:'请输入有效邮箱'}
export function validateVerificationCode(value:string):string|null{return /^\d{6}$/.test(value.trim())?null:'请输入 6 位验证码'}

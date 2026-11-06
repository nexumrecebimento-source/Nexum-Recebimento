/* Nexum — ligação com o Firebase.
   Enquanto FIREBASE for null, os apps funcionam no modo local (cada aparelho guarda os seus dados).
   O bloco firebaseConfig NÃO é senha: ele identifica o projeto. Quem protege os dados são as regras do Firestore. */
window.NEXUM_NUVEM = {
  FIREBASE: null,
  /* quem pode entrar e em qual app (e-mail em minúsculas) */
  USUARIOS: {
    "thaynara.santos@milplan.com.br": { nome: "Thaynara Santos", perfil: "escritorio" },
    "marcos.silva@milplan.com.br": { nome: "Marcos Silva", perfil: "campo" }
  }
};

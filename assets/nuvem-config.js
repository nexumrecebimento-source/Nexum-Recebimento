/* Nexum — ligação com o Firebase.
   Enquanto FIREBASE for null, os apps funcionam no modo local (cada aparelho guarda os seus dados).
   O bloco firebaseConfig NÃO é senha: ele identifica o projeto. Quem protege os dados são as regras do Firestore. */
window.NEXUM_NUVEM = {
  FIREBASE: {
    apiKey: "AIzaSyDQHNUc0Q13QLgzxe2_Sqk-6j2-yDn-pD0",
    authDomain: "nexum-27e9b.firebaseapp.com",
    projectId: "nexum-27e9b",
    storageBucket: "nexum-27e9b.firebasestorage.app",
    messagingSenderId: "406907215685",
    appId: "1:406907215685:web:0efa99b9cf3c8aa734682c"
  },
  /* quem pode entrar (e-mail em minúsculas) e o perfil:
     admin    = escritório, edita tudo (lança, corrige, aprova, importa, cadastros)
     consulta = escritório e celular, só visualiza e gera relatórios
     campo    = celular, lança recebimentos e anexa certificados */
  USUARIOS: {
    "thaynara.santos@milplan.com.br": { nome: "Thaynara Santos", perfil: "admin" },
    "samuel.souza@milplan.com.br": { nome: "Samuel Souza", perfil: "admin" },
    "marcos.silva@milplan.com.br": { nome: "Marcos Silva", perfil: "campo" },
    "wilson.pagani@milplan.com.br": { nome: "Wilson Pagani", perfil: "consulta" },
    "fredie.cota@milplan.com.br": { nome: "Fredie Cota", perfil: "consulta" },
    "eliene.vieira@milplan.com.br": { nome: "Eliene Vieira", perfil: "consulta" },
    "edigar.barreto@milplan.com.br": { nome: "Edigar Barreto", perfil: "consulta" }
  }
};

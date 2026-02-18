import { differenceInYears } from "date-fns";

type ContratoDefaults = {
  regras_ouro: string[];
  direitos: string[];
  consequencias_naturais: string[];
  limite_resgate_diario: number;
};

export function calcularIdade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  return differenceInYears(new Date(), new Date(dataNascimento));
}

export function getContratoDefaultsPorIdade(idade: number | null): ContratoDefaults {
  if (idade === null) return getDefaultsGenerico();

  if (idade <= 5) return getDefaults3a5();
  if (idade <= 8) return getDefaults6a8();
  if (idade <= 11) return getDefaults9a11();
  if (idade <= 14) return getDefaults12a14();
  return getDefaults15mais();
}

function getDefaults3a5(): ContratoDefaults {
  return {
    regras_ouro: [
      "Guardar os brinquedos depois de brincar",
      "Escovar os dentes após as refeições (com ajuda)",
      "Dizer 'por favor' e 'obrigado'",
      "Dormir no horário combinado",
    ],
    direitos: [
      "Escolher uma história antes de dormir",
      "30 minutos de desenho por dia",
      "Escolher a fruta do lanche",
      "Brincar livremente após as tarefas",
    ],
    consequencias_naturais: [
      "Se não guardar os brinquedos, eles ficam indisponíveis no dia seguinte",
      "Se não escovar os dentes, não pode comer doce no próximo dia",
    ],
    limite_resgate_diario: 20,
  };
}

function getDefaults6a8(): ContratoDefaults {
  return {
    regras_ouro: [
      "Arrumar a cama ao acordar",
      "Escovar os dentes 3 vezes ao dia",
      "Fazer a lição de casa antes de brincar",
      "Colocar a roupa suja no cesto",
      "Ser gentil com irmãos e colegas",
    ],
    direitos: [
      "1 hora de tela por dia (após tarefas)",
      "Escolher uma atividade no fim de semana",
      "Convidar um amigo para brincar em casa",
      "Participar da escolha do jantar uma vez por semana",
    ],
    consequencias_naturais: [
      "Se não fizer a lição, perde o tempo de tela do dia",
      "Se não arrumar a cama, não pode escolher atividade do fim de semana",
      "Se tratar alguém com desrespeito, perde 15 minutos do tempo de lazer",
    ],
    limite_resgate_diario: 30,
  };
}

function getDefaults9a11(): ContratoDefaults {
  return {
    regras_ouro: [
      "Manter o quarto organizado",
      "Estudar pelo menos 30 minutos por dia",
      "Tomar banho sem precisar ser lembrado",
      "Ajudar a colocar/tirar a mesa",
      "Respeitar horários de refeição e sono",
      "Cuidar do material escolar",
    ],
    direitos: [
      "1h30 de tela por dia (após tarefas e estudo)",
      "Escolher um passeio mensal em família",
      "Dormir mais tarde no fim de semana (até 22h)",
      "Ter mesada proporcional às tarefas cumpridas",
      "Opinar sobre as regras no contrato",
    ],
    consequencias_naturais: [
      "Se não estudar, perde o tempo de tela do dia",
      "Se não manter o quarto organizado, precisa organizá-lo antes de qualquer lazer",
      "Se não ajudar na mesa, lava a louça sozinho(a)",
    ],
    limite_resgate_diario: 40,
  };
}

function getDefaults12a14(): ContratoDefaults {
  return {
    regras_ouro: [
      "Manter o quarto e banheiro organizados",
      "Estudar pelo menos 1 hora por dia",
      "Respeitar horários de sono (22h em dias de escola)",
      "Comunicar onde está e com quem quando sair",
      "Ajudar nas tarefas domésticas combinadas",
      "Usar celular/redes sociais com responsabilidade",
      "Ser respeitoso na comunicação com a família",
    ],
    direitos: [
      "2 horas de tela por dia",
      "Sair com amigos nos finais de semana (com aprovação)",
      "Ter privacidade no quarto",
      "Participar das decisões familiares",
      "Escolher roupas e estilo pessoal",
      "Gerenciar parte do próprio dinheiro",
    ],
    consequencias_naturais: [
      "Se não comunicar paradeiro, perde permissão de sair na próxima vez",
      "Se usar celular de forma irresponsável, fica 24h sem ele",
      "Se não estudar, perde tempo de tela e saídas do fim de semana",
      "Se não ajudar em casa, não pode pedir favores extras",
    ],
    limite_resgate_diario: 50,
  };
}

function getDefaults15mais(): ContratoDefaults {
  return {
    regras_ouro: [
      "Manter seus espaços organizados",
      "Dedicar tempo adequado aos estudos",
      "Respeitar horário de chegada combinado",
      "Informar a família sobre planos e localização",
      "Contribuir com tarefas domésticas semanais",
      "Usar internet e redes sociais com consciência",
      "Manter comunicação aberta e respeitosa",
    ],
    direitos: [
      "Gerenciar o próprio tempo de tela",
      "Sair com amigos com autonomia (comunicando)",
      "Privacidade em seus espaços e dispositivos",
      "Voz ativa nas decisões familiares",
      "Gerenciar mesada com liberdade",
      "Escolher atividades extracurriculares",
      "Dormir no horário que considerar adequado nos fins de semana",
    ],
    consequencias_naturais: [
      "Se não respeitar horário de chegada, perde autonomia de saída por uma semana",
      "Se não contribuir em casa, perde privilégios extras",
      "Se notas caírem, revisão do tempo livre até recuperação",
    ],
    limite_resgate_diario: 60,
  };
}

function getDefaultsGenerico(): ContratoDefaults {
  return {
    regras_ouro: [
      "Manter o quarto organizado",
      "Escovar os dentes após as refeições",
      "Fazer as tarefas escolares no horário",
      "Ser respeitoso com todos da família",
      "Respeitar os horários combinados",
    ],
    direitos: [
      "Tempo de lazer após cumprir as tarefas",
      "Escolher uma atividade no fim de semana",
      "Participar das decisões da família",
      "Ter momentos de privacidade",
    ],
    consequencias_naturais: [
      "Se não cumprir as tarefas, perde tempo de lazer do dia",
      "Se não respeitar horários, perde privilégios do dia seguinte",
    ],
    limite_resgate_diario: 50,
  };
}

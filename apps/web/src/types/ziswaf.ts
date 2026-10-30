export interface InfaqCategory {
  id: string;
  name: string;
  count: number;
  amount: number;
  desc: string;
}

export interface InfaqProgram {
  id: string;
  name: string;
  category: string;
  target: number;
  collected: number;
  status: 'Aktif' | 'Selesai' | 'Draf';
}

export interface InfaqTransaction {
  id: string;
  donorName: string;
  amount: number;
  date: string;
  program: string;
  method: string;
  status: string;
}

export interface ZakatTransaction {
  id: string;
  muzakkiName: string;
  phone: string;
  type: string;
  calculation: string;
  amount: number;
  souls: number;
  date: string;
  status: string;
  bszNumber: string;
}

export interface AsnafDistribution {
  asnaf: string;
  allocationPercent: number;
  distributedAmount: number;
  recipients: number;
  desc: string;
}

export interface QurbanItem {
  id: string;
  category: string;
  title: string;
  breed: string;
  weightKg: string;
  price: number;
  stock: number;
  sold: number;
  distributionArea: string;
  image: string;
}

export interface PatunganGroup {
  groupTag: string;
  status: string;
  statusColor: string;
  shohibulList: string[];
  rphLocation: string;
  julehaTeam: string;
}

export interface ShohibulOrder {
  id: string;
  buyerName: string;
  /** Nomor WhatsApp tujuan blast laporan qurban, ternormalisasi `628xxxxxxxxx`. */
  whatsappNumber: string;
  animalType: string;
  qurbanNames: string;
  amount: number;
  distributionOption: string;
  wakalahTimestamp: string;
  wakalahLafazh: string;
  status: string;
}

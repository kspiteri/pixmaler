// The bundled sample artworks: public-domain works from Wikimedia Commons, grouped by category for
// the picker. Each `id` names `public/assets/samples/<id>.webp` and its thumbnail under `thumbs/`.

import { asset } from '../assets'

export type SampleCategory = 'landscapes' | 'portraits' | 'still-life' | 'nature'

export interface SampleArtwork {
  id: string
  title: string
  artist: string
  year: string
  origin: string
  category: SampleCategory
  // Wikimedia Commons file page, for provenance.
  credit: string
  // The bundled image's pixel size; lets a lazy thumbnail reserve its shape before it loads.
  dims: { w: number, h: number }
}

// Display order, with the lowercase eyebrow each group is headed by.
export const SAMPLE_CATEGORIES: readonly { id: SampleCategory, label: string }[] = [
  { id: 'landscapes', label: 'landscapes' },
  { id: 'portraits', label: 'portraits' },
  { id: 'still-life', label: 'still life' },
  { id: 'nature', label: 'nature' },
]

const COMMONS = 'https://commons.wikimedia.org/wiki/File:'

export const SAMPLES: readonly SampleArtwork[] = [
  { id: 'great-wave', title: 'The Great Wave off Kanagawa', artist: 'Katsushika Hokusai', year: 'c.1831', origin: 'Japan', category: 'landscapes', credit: `${COMMONS}Tsunami_by_hokusai_19th_century.jpg`, dims: { w: 1024, h: 688 } },
  { id: 'stalheim', title: 'From Stalheim', artist: 'Johan Christian Dahl', year: '1842', origin: 'Norway', category: 'landscapes', credit: `${COMMONS}Johan_Christian_Dahl_-_View_from_Stalheim_-_NG.M.01060_-_National_Museum_of_Art,_Architecture_and_Design.jpg`, dims: { w: 1024, h: 792 } },
  { id: 'loch-lomond', title: 'Loch Lomond', artist: 'Horatio McCulloch', year: '1861', origin: 'Scotland', category: 'landscapes', credit: `${COMMONS}Horatio-mcculloch-loch-lomond.jpg`, dims: { w: 1024, h: 710 } },
  { id: 'malta-levante', title: 'Malta. Presa dal Levante', artist: 'Francesco Zerilli', year: 'c.1825', origin: 'Malta', category: 'landscapes', credit: `${COMMONS}Francesco_Zerilli_Malta_presa_dal_Levante_1825.jpg`, dims: { w: 1059, h: 683 } },
  { id: 'grand-harbour-1', title: 'Grand Harbour, Valletta', artist: 'Girolamo Gianni', year: 'c.1869', origin: 'Malta', category: 'landscapes', credit: `${COMMONS}Girolamo_Gianni_(1837-1895)_-_Grand_Harbour,_Valletta_-_LDOSJ1902_-_Museum_of_the_Order_of_St_John.jpg`, dims: { w: 1200, h: 417 } },
  { id: 'grand-harbour-2', title: 'Valletta Harbour, Malta', artist: 'Girolamo Gianni', year: 'c.1870', origin: 'Malta', category: 'landscapes', credit: `${COMMONS}Girolamo_Gianni,_Valletta_Harbour,_Malta.jpg`, dims: { w: 1926, h: 683 } },
  { id: 'impression-sunrise', title: 'Impression, Sunrise', artist: 'Claude Monet', year: '1872', origin: 'France', category: 'landscapes', credit: `${COMMONS}Monet_-_Impression,_Sunrise.jpg`, dims: { w: 1024, h: 794 } },
  { id: 'starry-night', title: 'The Starry Night', artist: 'Vincent van Gogh', year: '1889', origin: 'Netherlands', category: 'landscapes', credit: `${COMMONS}Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg`, dims: { w: 1024, h: 811 } },
  { id: 'napoleon-alps', title: 'Napoleon Crossing the Alps', artist: 'Jacques-Louis David', year: '1801', origin: 'France', category: 'landscapes', credit: `${COMMONS}David_-_Napoleon_crossing_the_Alps_-_Malmaison1.jpg`, dims: { w: 873, h: 1024 } },
  { id: 'leiv-eiriksson', title: 'Leiv Eiriksson Discovers America', artist: 'Christian Krohg', year: '1893', origin: 'Norway', category: 'landscapes', credit: `${COMMONS}Christian-krohg-leiv-eriksson.jpg`, dims: { w: 1049, h: 683 } },

  { id: 'mona-lisa', title: 'Mona Lisa', artist: 'Leonardo da Vinci', year: 'c.1503', origin: 'Italy', category: 'portraits', credit: `${COMMONS}Mona_Lisa.jpg`, dims: { w: 683, h: 1033 } },
  { id: 'pearl-earring', title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', year: 'c.1665', origin: 'Netherlands', category: 'portraits', credit: `${COMMONS}1665_Girl_with_a_Pearl_Earring.jpg`, dims: { w: 865, h: 1024 } },
  { id: 'scream', title: 'The Scream', artist: 'Edvard Munch', year: '1893', origin: 'Norway', category: 'portraits', credit: `${COMMONS}Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg`, dims: { w: 825, h: 1024 } },
  { id: 'adele-bloch-bauer', title: 'Portrait of Adele Bloch-Bauer I', artist: 'Gustav Klimt', year: '1907', origin: 'Austria', category: 'portraits', credit: `${COMMONS}Gustav_Klimt,_1907,_Adele_Bloch-Bauer_I,_Neue_Galerie_New_York.jpg`, dims: { w: 960, h: 960 } },

  { id: 'sunflowers', title: 'Sunflowers', artist: 'Vincent van Gogh', year: '1888', origin: 'Netherlands', category: 'still-life', credit: `${COMMONS}Vincent_Willem_van_Gogh_127.jpg`, dims: { w: 781, h: 1024 } },
  { id: 'bouquet-glass-vase', title: 'Bouquet of Flowers in a Glass Vase', artist: 'Ambrosius Bosschaert', year: 'c.1620', origin: 'Netherlands', category: 'still-life', credit: `${COMMONS}Ambrosius_Bosschaert_the_Elder_-_Bouquet_of_Flowers_in_a_Glass_Vase_-_Google_Art_Project.jpg`, dims: { w: 694, h: 1024 } },
  { id: 'basket-of-apples', title: 'The Basket of Apples', artist: 'Paul Cézanne', year: 'c.1893', origin: 'France', category: 'still-life', credit: `${COMMONS}Paul_Cézanne_-_The_Basket_of_Apples_-_1926.252_-_Art_Institute_of_Chicago.jpg`, dims: { w: 1024, h: 820 } },
  { id: 'basket-of-fruit', title: 'Basket of Fruit', artist: 'Caravaggio', year: 'c.1599', origin: 'Italy', category: 'still-life', credit: `${COMMONS}Basket_of_Fruit-Caravaggio_(c.1595).jpg`, dims: { w: 1024, h: 730 } },

  { id: 'monarch-of-the-glen', title: 'The Monarch of the Glen', artist: 'Edwin Landseer', year: '1851', origin: 'Scotland', category: 'nature', credit: `${COMMONS}The_Monarch_of_the_Glen,_Edwin_Landseer,_1851.png`, dims: { w: 1024, h: 1009 } },
  { id: 'tiger-surprised', title: 'Tiger in a Tropical Storm (Surprised!)', artist: 'Henri Rousseau', year: '1891', origin: 'France', category: 'nature', credit: `${COMMONS}Henri_Rousseau_-_Surprise!.jpg`, dims: { w: 1024, h: 819 } },
  { id: 'whistlejacket', title: 'Whistlejacket', artist: 'George Stubbs', year: '1762', origin: 'England', category: 'nature', credit: `${COMMONS}Whistlejacket_by_George_Stubbs_edit.jpg`, dims: { w: 854, h: 1024 } },
  { id: 'water-lilies', title: 'Water Lilies', artist: 'Claude Monet', year: '1915', origin: 'France', category: 'nature', credit: `${COMMONS}Claude_Monet_-_Seerosen.jpg`, dims: { w: 1024, h: 759 } },
  { id: 'almond-blossom', title: 'Almond Blossom', artist: 'Vincent van Gogh', year: '1890', origin: 'Netherlands', category: 'nature', credit: `${COMMONS}Amandelbloesem_-_s0176V1962_-_Van_Gogh_Museum.jpg`, dims: { w: 960, h: 759 } },
  { id: 'irises', title: 'Irises', artist: 'Vincent van Gogh', year: '1890', origin: 'Netherlands', category: 'nature', credit: `${COMMONS}Irissen_-_s0050V1962_-_Van_Gogh_Museum.jpg`, dims: { w: 813, h: 1024 } },
  { id: 'merian-metamorphosis', title: 'Banana Flower and Fruit', artist: 'Maria Sibylla Merian', year: '1705', origin: 'Germany / Suriname', category: 'nature', credit: `${COMMONS}Maria_Sibylla_Merian_Banana_Flower_and_Fruit,_from_Metamorphosis_insectorum_Surinamensium_1705.jpg`, dims: { w: 745, h: 1024 } },
]

export const SAMPLES_BY_CATEGORY: Record<SampleCategory, SampleArtwork[]> = {
  'landscapes': SAMPLES.filter(s => s.category === 'landscapes'),
  'portraits': SAMPLES.filter(s => s.category === 'portraits'),
  'still-life': SAMPLES.filter(s => s.category === 'still-life'),
  'nature': SAMPLES.filter(s => s.category === 'nature'),
}

const BY_ID: Record<string, SampleArtwork> = Object.fromEntries(SAMPLES.map(s => [s.id, s]))

// `Object.hasOwn`, not a bare index: the id can come from localStorage, and 'constructor' is a key too.
export function sampleById(id: string): SampleArtwork | undefined {
  return Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined
}

export function sampleUrl(id: string): string {
  return asset(`assets/samples/${id}.webp`)
}

export function sampleThumbUrl(id: string): string {
  return asset(`assets/samples/thumbs/${id}.webp`)
}

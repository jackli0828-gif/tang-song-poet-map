/**
 * 迭代 6 · 时代都会（古今双列）
 * ------------------------------------------------------------------
 * 按「诗人所属朝代」给出当时全国的主要城市，每个城市同时列出：
 *   name   —— 当时的名称（古称，如「长安」「汴京」「临安」）
 *   modern —— 今日地名（如「陕西西安」「河南开封」「浙江杭州」）
 *
 * 史料依据：
 * - 唐：以《元和郡县图志》《通典·州郡典》所载诸州府治所，及开元十五道
 *       的核心都会为主，兼顾安西、北庭等都护府驻地。
 * - 宋：以《宋史·地理志》《元丰九域志》所载四京、诸路治所与重要州府为主，
 *       并标注辽、西夏、大理等并立政权的重要都城（供对照，非宋朝疆域）。
 *
 * 说明：
 * - rank: 1 = 都城 / 陪都；2 = 路府重镇；3 = 一般州府。
 * - 经纬度取**今日对应地**的坐标，与 poets.ts 的节点坐标同一口径。
 * - 第 6 轮起，地图标注会随「主诗人所属朝代」自动切换唐 / 宋两套都会。
 */

export interface EraCity {
  /** 当时名称（古称） */
  name: string;
  /** 今日地名 */
  modern: string;
  lng: number;
  lat: number;
  /** 1=都城/陪都 2=路府重镇 3=一般州府 */
  rank: 1 | 2 | 3;
  /** 一句话说明（建制沿革 / 当时地位） */
  note?: string;
}

/** 唐代主要都会（含东都、诸道治所与都护府驻地） */
export const TANG_CITIES: EraCity[] = [
  { name: '长安', modern: '陕西西安', lng: 108.94, lat: 34.34, rank: 1, note: '唐都，京兆府治，丝绸之路东端起点' },
  { name: '洛阳', modern: '河南洛阳', lng: 112.45, lat: 34.62, rank: 1, note: '东都，河南府治，与长安并为两京' },
  { name: '太原', modern: '山西太原', lng: 112.55, lat: 37.87, rank: 1, note: '北都，河东节度使驻所，李唐起兵之地' },
  { name: '扬州', modern: '江苏扬州', lng: 119.42, lat: 32.39, rank: 2, note: '淮南道治所，漕运枢纽，唐时最繁华的商业都会之一' },
  { name: '益州（成都）', modern: '四川成都', lng: 104.07, lat: 30.67, rank: 2, note: '剑南道治所，蜀中首府，有「扬一益二」之说' },
  { name: '江陵（荆州）', modern: '湖北荆州', lng: 112.24, lat: 30.34, rank: 2, note: '荆南节度使驻所，长江中游重镇' },
  { name: '襄阳', modern: '湖北襄阳', lng: 112.14, lat: 32.04, rank: 2, note: '山南东道治所，南北交通要冲' },
  { name: '汴州', modern: '河南开封', lng: 114.31, lat: 34.8, rank: 2, note: '汴宋节度使驻所，后为五代与北宋都城' },
  { name: '吴郡（苏州）', modern: '江苏苏州', lng: 120.62, lat: 31.32, rank: 2, note: '江南东道重镇，唐后期财赋所出' },
  { name: '余杭郡（杭州）', modern: '浙江杭州', lng: 120.15, lat: 30.27, rank: 3, note: '江南东道属州，唐时已为东南名郡' },
  { name: '会稽（越州）', modern: '浙江绍兴', lng: 120.58, lat: 30.01, rank: 2, note: '浙东观察使治所，浙东文化中心' },
  { name: '明州', modern: '浙江宁波', lng: 121.55, lat: 29.87, rank: 3, note: '浙东海港，遣唐使往来口岸之一' },
  { name: '江夏（鄂州）', modern: '湖北武汉', lng: 114.31, lat: 30.55, rank: 2, note: '武昌军节度使驻所，长江中游都会' },
  { name: '洪州', modern: '江西南昌', lng: 115.89, lat: 28.68, rank: 2, note: '江南西道治所，豫章故郡' },
  { name: '潭州', modern: '湖南长沙', lng: 112.94, lat: 28.23, rank: 3, note: '湖南观察使治所' },
  { name: '番禺（广州）', modern: '广东广州', lng: 113.26, lat: 23.13, rank: 2, note: '岭南道治所，海上丝绸之路大港' },
  { name: '泉州', modern: '福建泉州', lng: 118.68, lat: 24.87, rank: 3, note: '闽南港城，唐末已通番舶' },
  { name: '福州', modern: '福建福州', lng: 119.3, lat: 26.08, rank: 3, note: '福建观察使治所' },
  { name: '桂州', modern: '广西桂林', lng: 110.29, lat: 25.27, rank: 3, note: '桂管经略使驻所，岭南西道重镇' },
  { name: '夔州', modern: '重庆奉节', lng: 109.47, lat: 31.02, rank: 3, note: '川东门户，三峡险塞' },
  { name: '徐州', modern: '江苏徐州', lng: 117.18, lat: 34.26, rank: 2, note: '武宁军节度使驻所，南北襟喉' },
  { name: '宋州（睢阳）', modern: '河南商丘', lng: 115.65, lat: 34.41, rank: 3, note: '汴水要冲，安史之乱中睢阳保卫战在此' },
  { name: '楚州', modern: '江苏淮安', lng: 119.02, lat: 33.61, rank: 3, note: '运河与淮河交汇处，漕运重镇' },
  { name: '魏州（大名）', modern: '河北大名', lng: 115.14, lat: 36.28, rank: 3, note: '魏博节度使驻所，河北强藩' },
  { name: '幽州（范阳）', modern: '北京', lng: 116.4, lat: 39.9, rank: 2, note: '范阳节度使驻所，安史之乱发源地' },
  { name: '青州', modern: '山东青州', lng: 118.48, lat: 36.71, rank: 3, note: '平卢节度使驻所，齐鲁名郡' },
  { name: '登州', modern: '山东蓬莱', lng: 120.76, lat: 37.81, rank: 3, note: '山东半岛海口，通新罗、渤海' },
  { name: '凉州（武威）', modern: '甘肃武威', lng: 102.63, lat: 37.93, rank: 2, note: '河西节度使驻所，丝路重镇' },
  { name: '沙州（敦煌）', modern: '甘肃敦煌', lng: 94.66, lat: 40.14, rank: 3, note: '丝路咽喉，莫高窟所在地' },
  { name: '安西（龟兹）', modern: '新疆库车', lng: 82.96, lat: 41.72, rank: 2, note: '安西都护府治所，西域军政中心' },
  { name: '北庭（庭州）', modern: '新疆吉木萨尔', lng: 89.03, lat: 43.83, rank: 3, note: '北庭都护府治所，天山北麓要地' },
];

/** 宋代主要都会（含四京、诸路治所；并标辽/西夏/大理都城以资对照） */
export const SONG_CITIES: EraCity[] = [
  { name: '东京（汴京）', modern: '河南开封', lng: 114.31, lat: 34.8, rank: 1, note: '北宋都城，汴河漕运枢纽，《清明上河图》所绘' },
  { name: '西京（洛阳）', modern: '河南洛阳', lng: 112.45, lat: 34.62, rank: 1, note: '宋之西京，河南府，士大夫退居讲学之地' },
  { name: '南京（应天府）', modern: '河南商丘', lng: 115.65, lat: 34.41, rank: 1, note: '宋之南京，太祖发迹之州' },
  { name: '北京（大名府）', modern: '河北大名', lng: 115.14, lat: 36.28, rank: 1, note: '宋之北京，控扼河北，抗辽前沿' },
  { name: '行在（临安）', modern: '浙江杭州', lng: 120.15, lat: 30.27, rank: 1, note: '南宋都城，两浙路治所，宋词繁盛之地' },
  { name: '建康（江宁）', modern: '江苏南京', lng: 118.78, lat: 32.06, rank: 2, note: '江南东路治所，南宋留都' },
  { name: '平江（苏州）', modern: '江苏苏州', lng: 120.62, lat: 31.32, rank: 2, note: '两浙西路重镇，宋时财赋甲天下' },
  { name: '扬州', modern: '江苏扬州', lng: 119.42, lat: 32.39, rank: 2, note: '淮南东路治所，淮左名都' },
  { name: '镇江', modern: '江苏镇江', lng: 119.45, lat: 32.2, rank: 3, note: '长江与运河交汇，南宋江防要地' },
  { name: '绍兴（越州）', modern: '浙江绍兴', lng: 120.58, lat: 30.01, rank: 2, note: '两浙东路治所，陆游故里' },
  { name: '庆元（明州）', modern: '浙江宁波', lng: 121.55, lat: 29.87, rank: 2, note: '南宋重要海港，通日本、高丽' },
  { name: '温州', modern: '浙江温州', lng: 120.7, lat: 28.0, rank: 3, note: '两浙东路属州，永嘉学派发源地' },
  { name: '福州', modern: '福建福州', lng: 119.3, lat: 26.08, rank: 2, note: '福建路治所' },
  { name: '泉州', modern: '福建泉州', lng: 118.68, lat: 24.87, rank: 2, note: '南宋第一大港，海上丝绸之路起点' },
  { name: '广州', modern: '广东广州', lng: 113.26, lat: 23.13, rank: 2, note: '广南东路治所，番舶云集' },
  { name: '成都府（益州）', modern: '四川成都', lng: 104.07, lat: 30.67, rank: 2, note: '成都府路治所，蜀中都会' },
  { name: '兴元（汉中）', modern: '陕西汉中', lng: 107.02, lat: 33.07, rank: 3, note: '利州路治所，川陕咽喉' },
  { name: '京兆（长安）', modern: '陕西西安', lng: 108.94, lat: 34.34, rank: 2, note: '永兴军路治所，唐都故地' },
  { name: '襄阳', modern: '湖北襄阳', lng: 112.14, lat: 32.04, rank: 2, note: '京西南路治所，南宋抗蒙前线' },
  { name: '江陵（荆州）', modern: '湖北荆州', lng: 112.24, lat: 30.34, rank: 3, note: '荆湖北路重镇' },
  { name: '鄂州（武昌）', modern: '湖北武汉', lng: 114.31, lat: 30.55, rank: 2, note: '荆湖北路治所，长江中游都会' },
  { name: '潭州（长沙）', modern: '湖南长沙', lng: 112.94, lat: 28.23, rank: 2, note: '荆湖南路治所' },
  { name: '隆兴（洪州）', modern: '江西南昌', lng: 115.89, lat: 28.68, rank: 2, note: '江南西路治所，豫章故郡' },
  { name: '庐州（合肥）', modern: '安徽合肥', lng: 117.28, lat: 31.86, rank: 3, note: '淮南西路治所' },
  { name: '寿春（寿州）', modern: '安徽寿县', lng: 116.79, lat: 32.58, rank: 3, note: '淮上重镇，宋金对峙前沿' },
  { name: '楚州', modern: '江苏淮安', lng: 119.02, lat: 33.61, rank: 3, note: '运河要冲，宋金边界重镇' },
  { name: '密州', modern: '山东诸城', lng: 119.41, lat: 35.99, rank: 3, note: '京东东路属州，苏轼知密州处' },
  { name: '青州', modern: '山东青州', lng: 118.48, lat: 36.71, rank: 3, note: '京东东路治所' },
  { name: '徐州', modern: '江苏徐州', lng: 117.18, lat: 34.26, rank: 3, note: '京东西路属州，苏辙、苏轼均曾知徐州' },
  { name: '太原', modern: '山西太原', lng: 112.55, lat: 37.87, rank: 2, note: '河东路治所' },
  { name: '秦州（天水）', modern: '甘肃天水', lng: 105.72, lat: 34.58, rank: 3, note: '秦凤路治所，宋夏边界' },
  { name: '兰州', modern: '甘肃兰州', lng: 103.83, lat: 36.06, rank: 3, note: '熙河路重镇，黄河渡口' },
  { name: '兴庆府', modern: '宁夏银川', lng: 106.27, lat: 38.47, rank: 1, note: '西夏都城（与宋并立，非宋疆域）' },
  { name: '燕京', modern: '北京', lng: 116.4, lat: 39.9, rank: 1, note: '辽南京、金中都（与宋并立，非宋疆域）' },
  { name: '大理', modern: '云南大理', lng: 100.23, lat: 25.59, rank: 1, note: '大理国都城（与宋并立，非宋疆域）' },
  { name: '静江（桂州）', modern: '广西桂林', lng: 110.29, lat: 25.27, rank: 3, note: '广南西路治所' },
  { name: '泸州', modern: '四川泸州', lng: 105.44, lat: 28.87, rank: 3, note: '潼川府路重镇，川南门户' },
];

/** 按朝代取对应时代的都会列表（用于随诗人自动切换） */
export function citiesOfDynasty(dynasty: '唐' | '宋'): EraCity[] {
  return dynasty === '唐' ? TANG_CITIES : SONG_CITIES;
}

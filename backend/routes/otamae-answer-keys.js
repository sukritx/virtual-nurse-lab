const otamaeAnswerKeys = {
    1: {
        ja: `
シナリオ1：基礎看護学：筋肉内注射（三角筋）

患者情報:
大手前氏は78歳の男性で、COVID-19ワクチンの追加接種を受けるために来院しました。既知の慢性疾患はなく、自宅で自立した生活を送っています。週1回のウォーキンググループや地域ボランティア活動に参加するなど、社会的にも活発です。定期的に服用している薬はなく、アレルギー、慢性疾患、ワクチンによる過去の副反応の既往もありません。現在、発熱や急性疾患の症状も否定しています。
加齢に伴う聴力低下があり、時々聞き返すことがあります。診察中は落ち着いて協力的ですが、ワクチンの副作用について軽い不安を示しています。年齢を考慮し、安全性についての説明と安心感を求めており、十分な説明と適切な指導を受けたうえで接種を受ける意思を示しています。

設問:
医師の指示のもと、この患者にCOVID-19ワクチンを筋肉内注射する場合、どのように実施しますか？

主要な解答（採点ルーブリック）:
1. スクリーニングと説明（小計 25点）
- 患者本人確認を行う（5点）
- 禁忌（アレルギー・発熱・過去の副反応）を確認する（6点）
- はっきり適度な速さで話し、ティーチバックで理解を確認する（聴力低下に配慮）（5点）
- 目的（重症化予防）と一般的・まれな副反応を説明する（5点）
- 同意を得る（4点）

2. 準備（小計 20点）
- 手指衛生を行う（4点）
- シャープス容器を含め物品を準備する（5点）
- ワクチン名・用量・ロット番号・有効期限を確認する（6点）
- 高齢者の筋肉量低下を考慮し適切な針の長さを選ぶ（5点）

3. 実施（小計 30点）
- プライバシーを確保し体位を整える（4点）
- 三角筋部位を正しく確認する（肩峰から指2〜3本分下）（8点）
- 皮膚を消毒し乾燥させる（5点）
- 90度で刺入し一定の速度で注入する（8点）
- 抜針・圧迫し、針を直ちに廃棄する（5点）

4. 注射後のケア（小計 25点）
- 15〜30分観察する（高齢者リスク）（6点）
- 一般的症状（注射部位痛・発熱・頭痛・倦怠感）を説明する（5点）
- 緊急症状（呼吸困難・意識消失）を説明する（6点）
- 注射部位をこすらないよう指導する（3点）
- 接種内容（用量・製造元・ロット・部位・時間・実施者）を記録する（5点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 1: Fundamental Nursing - Intramuscular Injection (Deltoid Muscle)

Patient Information:
Mr. Otemae is a 78-year-old man who has come to the clinic to receive a COVID-19 booster vaccination. He has no known chronic illnesses and lives independently at home. He is socially active, taking part in a weekly walking group and community volunteer activities. He takes no regular medications and has no history of allergies, chronic disease, or previous adverse reactions to vaccines. He currently denies fever or any symptoms of acute illness.
He has age-related hearing loss and occasionally asks for things to be repeated. He is calm and cooperative during the consultation but expresses mild anxiety about vaccine side effects. In view of his age, he is seeking explanation and reassurance about safety, and has indicated his willingness to be vaccinated after receiving sufficient explanation and appropriate guidance.

Question:
Under a physician's order, how would you administer the COVID-19 vaccine to this patient by intramuscular injection?

Key Answer (Scoring Rubric):
1. Screening & Explanation (Subtotal 25)
- Verify the patient's identity (5 points)
- Check contraindications (allergies, fever, previous adverse reactions) (6 points)
- Speak clearly at a moderate pace; confirm understanding with teach-back (hearing loss) (5 points)
- Explain purpose (prevent severe disease) and common/rare side effects (5 points)
- Obtain consent (4 points)

2. Preparation (Subtotal 20)
- Perform hand hygiene (4 points)
- Prepare equipment including a sharps container (5 points)
- Verify vaccine name, dose, lot number, expiry (the rights) (6 points)
- Select an appropriate needle length (reduced muscle mass in older adults) (5 points)

3. Administration (Subtotal 30)
- Ensure privacy and appropriate positioning (4 points)
- Identify the deltoid site correctly (2-3 fingerbreadths below the acromion) (8 points)
- Disinfect the skin and allow it to dry (5 points)
- Insert at 90° and inject at a steady rate (8 points)
- Withdraw, apply pressure, and dispose of the needle immediately (5 points)

4. Post-Injection Care (Subtotal 25)
- Observe for 15-30 minutes (older-adult risk) (6 points)
- Explain common symptoms (site pain, fever, headache, fatigue) (5 points)
- Explain emergency symptoms (dyspnea, loss of consciousness) (6 points)
- Instruct the patient not to rub the site (3 points)
- Document (dose, manufacturer, lot, site, time, administrator) (5 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    2: {
        ja: `
シナリオ2：基礎看護学：酸素療法：酸素マスク着用時の看護

患者情報:
患者は田中一郎さん（仮名）、72歳男性。身長168cm、体重65kg。肺炎により入院3日目。発熱と咳嗽が続き、本日早朝から呼吸困難感が増強したため、医師より酸素マスクによる酸素療法（5L/分）が開始された。既往歴にCOPD（慢性閉塞性肺疾患）、高血圧、2型糖尿病がある。アレルギーはなし。

臨床データ:
初期バイタルサイン：T 38.2°C・BP 146/82 mmHg・P 108/min・RR 28/min・SpO₂ 85%（ルームエアー）・JCS 0
酸素療法後：マスク5L/分・SpO₂ 92%・RR 24/min
検査：WBC 14,200/μL・CRP 12.8 mg/dL・PaO₂ 58 mmHg・PaCO₂ 48 mmHg・pH 7.36
薬剤：セフトリアキソン静注・アセトアミノフェン・チオトロピウム吸入・アムロジピン

設問:
設問1（初期観察）：酸素マスク装着後、最優先で観察すべき項目を3つ挙げ、その理由を説明してください。
設問2（コミュニケーション）：「このマスク、苦しくて外したいんだけど……。」患者の不安に配慮しながら、酸素療法継続の必要性を説明してください。
設問3（看護介入）：①酸素マスク装着中の患者に実施すべき看護ケアを3つ挙げてください。②SpO₂ 88%、呼吸数32回/分、患者「ますます苦しい」との訴え。看護学生としてどう対処しますか。
選択肢：A. そのまま経過観察する　B. マスクの装着状態と酸素流量を確認し、医師へ報告する（正答）　C. 酸素マスクを外して鼻カニューレへ変更する　D. 患者を仰臥位にする

主要な解答（採点ルーブリック）:
設問1：最優先の観察3項目（小計 30点）
- SpO₂・呼吸数／呼吸様式（酸素化の評価）（12点）
- 意識レベル／CO₂貯留の徴候（傾眠）―COPDのリスク（9点）
- マスクの装着状態・流量・顔面の皮膚／快適性（9点）

設問2：コミュニケーション（小計 20点）
- 苦痛と不安を共感的に受けとめる（6点）
- 酸素化維持と回復のため酸素が必要であると説明する（8点）
- 安心を与え、快適さを図る（そばに付き添う）（6点）

設問3①：マスク装着中の看護ケア（小計 25点）
- SpO₂と呼吸状態を継続的に観察する（9点）
- 装着・流量を確認し、皮膚障害や粘膜乾燥を予防する（8点）
- 体位（セミファウラー位）を整え酸素需要を軽減する（8点）

設問3②：低酸素悪化時の対応（判断）（小計 25点）
- 正答B：マスクの装着状態と流量を確認し、医師へ報告する（25点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 2: Fundamental Nursing - Oxygen Therapy: Care of a Patient Wearing an Oxygen Mask

Patient Information:
The patient is Mr. Ichiro Tanaka (pseudonym), a 72-year-old man. Height 168 cm, weight 65 kg. He is on day 3 of hospitalization for pneumonia. Fever and cough have persisted, and his sense of breathing difficulty worsened from early this morning, so the physician started oxygen therapy via an oxygen mask (5 L/min). His history includes COPD, hypertension, and type 2 diabetes mellitus. No allergies.

Clinical Data:
Initial vital signs: T 38.2°C · BP 146/82 mmHg · P 108/min · RR 28/min · SpO₂ 85% (room air) · JCS 0
After oxygen therapy: mask 5 L/min · SpO₂ 92% · RR 24/min
Labs: WBC 14,200/μL · CRP 12.8 mg/dL · PaO₂ 58 mmHg · PaCO₂ 48 mmHg · pH 7.36
Medications: ceftriaxone IV · acetaminophen · tiotropium inhalation · amlodipine

Questions:
Q1 (Initial observation): After the mask is applied, list the three highest-priority items to observe and explain the reason for each.
Q2 (Communication): The patient says, "This mask is so uncomfortable that I want to take it off..." Showing consideration for his anxiety, explain why oxygen therapy must be continued.
Q3 (Nursing interventions): (1) List three nursing care measures for a patient wearing an oxygen mask. (2) SpO₂ is 88%, RR 32/min, and the patient says "It is getting harder to breathe." As a nursing student, how do you respond?
Choices: A. Continue observation without further action. B. Check the mask fit and oxygen flow rate, and report to the physician. (correct) C. Remove the oxygen mask and change to a nasal cannula. D. Place the patient in the supine position.

Key Answer (Scoring Rubric):
Q1 - Three priority observations (Subtotal 30)
- SpO₂ and respiratory rate / effort (adequacy of oxygenation) (12 points)
- Level of consciousness / signs of CO₂ retention (drowsiness) - COPD risk (9 points)
- Mask fit, flow rate, and facial skin / comfort (9 points)

Q2 - Communication (Subtotal 20)
- Acknowledge the patient's discomfort and anxiety empathetically (6 points)
- Explain that oxygen is needed to maintain oxygenation and aid recovery (8 points)
- Reassure and offer comfort measures (stay with the patient) (6 points)

Q3(1) - Nursing care while wearing the mask (Subtotal 25)
- Continuously monitor SpO₂ and respiratory status (9 points)
- Check mask fit / flow; prevent skin breakdown and mucosal dryness (8 points)
- Position (semi-Fowler's) and reduce oxygen demand (8 points)

Q3(2) - Deteriorating hypoxia (single decision) (Subtotal 25)
- Correct answer B: check mask fit and oxygen flow rate, then report to the physician (25 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    3: {
        ja: `
シナリオ3：母性看護学：腹部観察

場面:
産科外来。22歳の妊婦（初産、妊娠31週）が定期健診のために来院した。胎動は良好、全身状態は正常。腹部診察の結果：子宮底高（FH）＝27cm、臍と剣状突起の間、胎向は第2胎向、頭部浮球感あり、胎児心拍数（FHR）＝138〜156bpm。

設問:
腹部観察の目的を説明し、与えられた結果に基づいて視診・触診・聴診・計測診を実施してください。

主要な解答（採点ルーブリック）:
腹部観察の目的（小計 20点）
- 子宮底高と妊娠週数を比較し胎児の発育を評価する（8点）
- 胎児の横位・先進部・姿勢・位置を評価する（7点）
- 妊娠週数・予定日・生存性を推定し看護計画の資料とする（5点）

1. 視診（小計 15点）
- 腹部は卵形で縦位である（6点）
- 子宮底高は臍と剣状突起中央に位置する（5点）
- 妊娠線・浮腫・腹直筋離開・臍窩を観察する（4点）

2. 触診（レオポルド触診法）（小計 35点）
- レオポルド触診法で位置・姿勢・数・羊水量を評価する（8点）
- 子宮底は柔らかく広く胎児の臀部（浮球感なし）（8点）
- 胎児背部は母体右側（平滑面）、四肢は左側（8点）
- 先進部は頭部で恥骨結合上に浮動し未嵌入（7点）
- 胎向：第2胎向（ROP）（4点）

3. 聴診（小計 20点）
- 胎児心音は母体右下腹部で聴取される（7点）
- 胎児心拍数は規則的で138〜156回/分（8点）
- 臍帯音は規則的で胎児心拍と一致する（5点）

4. 計測診（小計 10点）
- 子宮底長は恥骨結合上縁から計測する（5点）
- 子宮底長27cmで妊娠週数と一致（5点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 3: Maternal Nursing - Abdominal Examination

Setting:
A 22-year-old pregnant woman (primigravida, 31 weeks of gestation) has come to the obstetric outpatient clinic for a routine antenatal checkup. Fetal movements are good and her general condition is normal. Abdominal examination findings: fundal height (FH) = 27 cm (between the umbilicus and the xiphoid process); fetal position = second position; the fetal head is ballotable (floating); fetal heart rate (FHR) = 138-156 bpm.

Question:
Explain the purposes of abdominal examination, then carry out inspection, palpation, auscultation, and measurement based on the given findings.

Key Answer (Scoring Rubric):
Purpose of abdominal examination (Subtotal 20)
- Compare fundal height with gestational age / assess fetal growth (8 points)
- Assess fetal lie, presentation, attitude, and position (7 points)
- Estimate gestational age / EDD and viability; data for care planning (5 points)

1. Inspection (Subtotal 15)
- Abdomen ovoid, longitudinal lie (6 points)
- Fundal height located between umbilicus and xiphoid process (5 points)
- Observe striae, edema, diastasis recti, umbilicus (4 points)

2. Palpation (Leopold's maneuvers) (Subtotal 35)
- Use Leopold's maneuvers to assess position, attitude, number, fluid (8 points)
- Fundus soft/broad = fetal buttocks (no ballottement) (8 points)
- Fetal back on mother's right (smooth); limbs on the left (8 points)
- Presenting part is head, floating above symphysis, not engaged (7 points)
- Position: second position (ROP) (4 points)

3. Auscultation (Subtotal 20)
- Fetal heart sounds heard on the mother's right lower abdomen (7 points)
- FHR regular, 138-156 bpm (8 points)
- Funic (cord) souffle, regular, coincides with FHR (5 points)

4. Measurement (Subtotal 10)
- Measure FH from the upper border of the symphysis pubis (5 points)
- FH 27 cm, consistent with gestational age (5 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    4: {
        ja: `
シナリオ4：母性看護学：退院指導

患者情報:
スニサ・ミースックさん、30歳。妊娠・分娩歴：G2P1（経産婦）。特記すべき既往なし、実母に糖尿病。産後4日目。妊娠40週3日で経腟にて女児を出産（出生体重3,350g、新生児低血糖なし、健康状態良好）。
妊娠中期に妊娠糖尿病（GDM）と診断され、食事療法のみで良好に管理された。妊娠前体重65kg、身長160cm（BMI 25.4）、分娩時体重83kg（増加18kg）。分娩後血糖値は正常範囲に回復。

臨床データ:
バイタルサイン（正常範囲）：T 37.2°C・P 82/min・RR 18/min・BP 115/75 mmHg
子宮底は臍下4横指・硬く収縮良好、悪露は赤褐色・少量、会陰縫合部に腫脹・発赤なし
軽度の乳房緊満；乳頭は正常で亀裂なし；児の哺乳は良好；母乳育児を希望；乳汁分泌良好
明日退院予定・2週間健診および1か月健診でフォローアップ
薬剤：クエン酸第一鉄ナトリウム1錠 1日1回食後・イブプロフェン200mg 頓用（1日最大3錠）

設問:
医師が退院指示を出した後、看護学生としてこの患者への退院指導をどのように行いますか？

主要な解答（採点ルーブリック）:
1. 一般的なセルフケア（小計 30点）
- 回復のため十分な休息をとる（4点）
- 会陰・悪露のケア；38℃以上の発熱や悪臭時は受診（7点）
- 重い物の持ち上げや高負荷運動を避ける（5点）
- 活動は徐々に再開し、1か月は支援者を確保する（4点）
- ケーゲル体操（骨盤底筋）を行う（4点）
- 家族計画：1か月健診まで性生活を避ける；月経前に排卵の可能性；コンドーム（6点）

2. 食事ガイドライン（小計 25点）
- 母乳分泌のため十分な水分補給（4点）
- 血糖管理のため食物繊維の多い複合炭水化物を選ぶ（6点）
- 毎食、未加工のたんぱく質を摂取する（5点）
- バランス食、脂質・塩分控えめ、野菜1日350g以上（6点）
- 健康的な間食；アルコール・カフェインに注意（4点）

3. 薬物と授乳（小計 20点）
- 鉄剤は処方通り；便が黒くなる；タンニン飲料と併用しない（6点）
- イブプロフェンは6〜8時間ごと頓用（4点）
- 母乳育児は糖代謝を改善し将来の糖尿病を予防する（6点）
- 母乳外来・産後ケアの資源を活用する（4点）

4. 経過観察と受診サイン（小計 25点）
- 産後6〜12週にOGTTでフォローアップ（8点）
- 長期的な2型糖尿病・メタボリスク；健康的生活習慣を維持（6点）
- 次回妊娠前に受診し糖尿病がないか確認（3点）
- 母体の危険兆候（出血・縫合部・乳房・発熱）（4点）
- 乳児ケア：予定通りの予防接種；感染兆候に注意（4点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 4: Maternal Nursing - Discharge Teaching (Postpartum, GDM)

Patient Information:
Ms. Sunisa Meesuk, 30 years old. Obstetric history G2P1 (multipara). No medical history of note; her mother has diabetes. She is on postpartum day 4: at 40 weeks 3 days she gave birth vaginally to a female infant (birth weight 3,350 g; no neonatal hypoglycemia; infant in good health).
During pregnancy she was diagnosed with gestational diabetes mellitus (GDM) in the second trimester, well controlled with diet alone. Pre-pregnancy weight 65 kg, height 160 cm (BMI 25.4); weight at delivery 83 kg (gain 18 kg). Postpartum blood glucose has returned to normal.

Clinical Data:
Vital signs (WNL): T 37.2°C · P 82/min · RR 18/min · BP 115/75 mmHg
Fundus 4 fingerbreadths below umbilicus, firm · lochia reddish-brown, scant · episiotomy no swelling/redness
Mild breast engorgement; nipples normal, no fissures; infant feeding well; wishes to breastfeed; milk secretion good
Discharge tomorrow · follow-up at 2-week and 1-month checkups
Medications: sodium ferrous citrate 1 tab once daily after food · ibuprofen 200 mg PRN, max 3 tabs/day

Question:
After the physician has issued the discharge order, how would you, as a nursing student, provide discharge teaching for this patient?

Key Answer (Scoring Rubric):
1. General self-care (Subtotal 30)
- Ensure adequate rest for recovery (4 points)
- Perineal / lochia care; seek care if fever >=38°C or foul odor (7 points)
- Avoid heavy lifting and high-impact activity (5 points)
- Resume activity gradually; arrange help for 1 month (4 points)
- Kegel (pelvic floor) exercises (4 points)
- Family planning: avoid sex until 1-month check; ovulation may precede menses; condoms (6 points)

2. Dietary guidelines (Subtotal 25)
- Adequate hydration to support milk production (4 points)
- Complex, high-fiber carbohydrates for glucose control (6 points)
- Unprocessed protein at every meal (5 points)
- Balanced diet, low fat/salt, vegetables >=350 g/day (6 points)
- Healthy snacks; caution with alcohol and caffeine (4 points)

3. Medications & breastfeeding (Subtotal 20)
- Take iron as prescribed; may darken stool; avoid with tannin drinks (6 points)
- Ibuprofen every 6-8 h as needed (4 points)
- Breastfeeding improves glucose metabolism / prevents future DM (6 points)
- Use lactation / postpartum support resources (4 points)

4. Follow-up & warning signs (Subtotal 25)
- OGTT follow-up at 6-12 weeks postpartum (8 points)
- Long-term type 2 DM / metabolic risk; maintain healthy lifestyle (6 points)
- Preconception check before next pregnancy (3 points)
- Maternal danger signs (bleeding, wound, breast, fever) (4 points)
- Infant care: vaccination on schedule; watch for infection signs (4 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    5: {
        ja: `
シナリオ5：小児看護学：気管支喘息患児の看護

患者情報:
Aちゃん（5歳、男児）。診断名：気管支喘息大発作。入院1日目。酸素マスク5L/分実施中。左手背に末梢静脈路が確保されている。母の付き添いあり。不安が強く母に抱きついており、母も不安が強い様子である。
身長110cm、体重18.0kg。2歳から喘息で治療中、年2〜3回受診（入院歴なし）。最後の発作は約3か月前でその後は良好にコントロール。普段の治療薬：長期管理薬に吸入ステロイド（アドエア）・モンテルカスト、発作時にサルブタモール吸入（メプチン）。アレルギー：ダニ・ハウスダスト。予防接種は年齢相応に済。両親は共働き、祖父母は遠方、父は喫煙（約10本/日）。

臨床データ:
バイタルサイン：RR 40/min・SpO₂ 91%（ルームエアー）→ 96%（O₂ 5L/min）・HR 130/min・BP 100/60 mmHg・T 37.3°C
呼吸音は全体的に減弱し両側に著明な呼気性喘鳴；肩呼吸と肋下陥没；呼気延長；口唇チアノーゼ；単語から短い文章での会話；仰臥位不可（座位）；元気がない；食欲不振
検査：WBC 13,800/μL・RBC 4.80 M/μL・Hb 13.1 g/dL・Hct 38%・Plt 310,000/μL・Na 136・K 3.8・Cl 100・glucose 100 mg/dL・CRP 0.5 mg/dL・胸部X線で過膨張、浸潤影なし・インフルエンザ/コロナ陰性
治療：ソルデム3A 60 mL/h；メチルプレドニゾロンNaコハク酸エステル 20mg×4/日；モンテルカスト 4mg 夕食後；カルボシステイン 180mg 1日3回；サルブタモール（ベネトリン）×3/日；アドエア×2/日
指示：SpO₂ 95%以上を維持；病室内安静；経口摂取可；清拭・シャワー浴可；SpO₂＋心電図モニター；バイタルサイン×4/日；喘鳴増強時ベネトリン吸入

設問:
安楽な呼吸を保つために、看護学生としてどのように患児の全身状態を評価し、支援を行いますか？

主要な解答（採点ルーブリック）:
1. 全身状態の評価（小計 30点）
- 所見から発作の重症度を評価する＝大発作（10点）
- サルブタモール吸入が必要と判断する（10点）
- 不安を与えず観察し、母にそばにいてもらう（10点）

2. 日常生活援助（小計 30点）
- 栄養：食事に伴う呼吸を観察し無理せず、吸入後に食事（12点）
- 清潔：シャワーは呼吸悪化に注意し短時間で実施（8点）
- 休息：ギャッチアップし、クローズドクエスチョンで短時間の会話（10点）

3. 服薬支援（小計 15点）
- 5歳児なりに治療の必要性を説明する（7点）
- 内服・吸入は母と協力してディストラクションツール等を活用しながら実施する（8点）

4. 安全管理（小計 25点）
- 末梢静脈路の必要性を5歳児なりに患児に説明する（8点）
- 酸素投与とモニターの必要性を5歳児なりに患児に説明する（8点）
- チューブ・コード管理を母に説明し協力を得る（9点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 5: Pediatric Nursing - Care of a Child with Bronchial Asthma

Patient Information:
Child A (5-year-old boy). Diagnosis: bronchial asthma, severe attack. Day 1 of hospitalization; receiving oxygen 5 L/min via mask; a peripheral IV line is in place on the dorsum of the left hand. His mother is present; the child appears very anxious and clings to her, and the mother is also highly anxious.
Height 110 cm, weight 18.0 kg. Treated for asthma since age 2, with 2-3 attacks per year (no prior admission); last attack ~3 months ago, well controlled since. Usual medicines: inhaled corticosteroid (Adoair) and montelukast for control; inhaled salbutamol (Meptin) as reliever. Allergies: dust mites, house dust. Immunizations up to date. Lives with both working parents; grandparents live far away; father smokes ~10 cigarettes/day.

Clinical Data:
Vital signs: RR 40/min · SpO₂ 91% (room air) -> 96% (O₂ 5 L/min) · HR 130/min · BP 100/60 mmHg · T 37.3°C
Breath sounds diminished overall with marked expiratory wheeze bilaterally; shoulder breathing and subcostal retractions; prolonged expiration; lip cyanosis; speaks in single words to short sentences; cannot lie flat (sits up); low energy; poor appetite
Labs: WBC 13,800/μL · RBC 4.80 M/μL · Hb 13.1 g/dL · Hct 38% · Plt 310,000/μL · Na 136 · K 3.8 · Cl 100 · glucose 100 mg/dL · CRP 0.5 mg/dL · CXR hyperinflation, no infiltrate · influenza/coronavirus negative
Treatment: Soldem 3A 60 mL/h; methylprednisolone Na succinate 20 mg x4/day; montelukast 4 mg after dinner; carbocisteine 180 mg TID; salbutamol (Venetlin) x3/day; Adoair x2/day
Orders: maintain SpO₂ >=95%; rest in ward; oral intake OK; bed bath/shower OK; SpO₂ + ECG monitor; VS x4/day; Venetlin inhalation when wheeze worsens

Question:
To help the child maintain comfortable breathing, how would you, as a nursing student, assess the child's general condition and provide support?

Key Answer (Scoring Rubric):
1. Assessment of general condition (Subtotal 30)
- Assess attack severity from findings = severe attack (10 points)
- Recognize that salbutamol inhalation is needed (10 points)
- Observe without increasing anxiety; keep mother close (10 points)

2. Support with daily living (Subtotal 30)
- Nutrition: watch respiration with eating; don't force; feed after inhalation (12 points)
- Hygiene: recognize shower worsens respiration; keep it brief (8 points)
- Rest: elevate head of bed; use closed questions / short talk to conserve energy (10 points)

3. Medication support (Subtotal 15)
- Explain the need for treatment at a 5-year-old's level (7 points)
- Give oral and inhaled medicines with the mother's cooperation utilizing distraction tools as appropriate (8 points)

4. Safety management (Subtotal 25)
- Explain the purpose of the IV line so the child understands at a 5-year-old's level (8 points)
- Explain oxygen and monitors so the child understands at a 5-year-old's level (8 points)
- Explain tube/cable management to the mother and gain cooperation (9 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    6: {
        ja: `
シナリオ6：小児看護学：小児白血病をもつ子どもに対する寛解導入療法中の看護（慢性期）

患児情報:
Aくん、10歳6か月、男児、小学5年生。診断名：急性リンパ性白血病（ALL）。寛解導入療法中。全身状態は安定しているが、骨髄抑制期にあり感染リスクが高い。
水痘既往あり、予防接種済（BCG・四種混合・麻疹風疹・ムンプス）。身長148.2cm、体重40.5kg、発達は年齢相応。活発でサッカー好き、友人関係良好。5人家族：父（43歳・自営業）、母（40歳・自営業手伝い）、弟（7歳）、妹（3歳）。これまで健康で学校生活も良好。

臨床データ:
バイタルサイン：T 36.5°C・P 84/min・RR 18/min・BP 104/70 mmHg
骨髄抑制（白血球低値）；口内炎（改善傾向）；食欲低下／偏食；便秘傾向
化学療法：VCR・L-asp・DNR・MTX（髄注）・Ara-C（髄注）。ステロイド：プレドニゾロン。支持療法：オンダンセトロン・ST合剤（PCP予防）・アムホテリシンBシロップ
検査：WBC 0.7×10³/μL・Hb 8.5 g/dL・Plt 63×10³/μL・CRP 0.00 mg/dL
入院中：感染対策のため個室；行動範囲は室内；軽いリハビリを楽しむ；院内学級に時々欠席；ゲーム・動画の時間が長い
セルフケア：手洗い・消毒が不十分；歯磨きは1日1回程度（習慣化していない）；看護師への反抗的な発言あり
心理社会的：「勉強についていけない」と発言、学習意欲低下；同級生とオンライン交流；生活リズムの乱れ（夜更かし）；骨髄穿刺への不安
家族：母は2〜3日に1回程度面会、育児・仕事・面会の負担感あり；父の面会は困難
指示：病棟内自由；小児食（持ち込み可、生もの不可、加熱のみ）；入浴可（CV刺入部保護）；バイタルサイン×3/日；体重×1/日；発熱・嘔吐時の支持療法；必要時輸血

設問:
寛解導入療法中の慢性期にあるAくんに対して、看護学生としてどのような看護を提供しますか？特に、セルフケア行動の獲得および心理社会的側面への支援を含めて考えましょう。

主要な解答（採点ルーブリック）:
1. 身体管理（小計 22点）
- 骨髄抑制に伴う感染予防の徹底（8点）
- 口内炎の疼痛緩和と口腔ケア（5点）
- 悪心・食欲低下への対応（食事形態の工夫）（5点）
- 便秘への対応（排便コントロール）（4点）

2. セルフケア行動の支援（小計 20点）
- 手洗い・歯磨きの必要性を発達段階に応じて説明（6点）
- できていることを評価し自己効力感を高める（5点）
- 一方的指導でなく本人の意向を尊重する（5点）
- 行動の見える化（チェック表など）（4点）

3. 生活リズムの調整（小計 12点）
- 睡眠・覚醒リズムの調整支援（5点）
- ゲーム時間を適切にコントロールする（4点）
- 日中活動（学習・リハビリ）を促進する（3点）

4. 心理的支援（小計 12点）
- 検査・治療への不安を傾聴する（6点）
- 「勉強についていけない」思いに共感する（6点）

5. 発達支援・学習支援（小計 12点）
- 訪問学級への参加を促す（4点）
- 成功体験を積める学習支援（4点）
- 遊びや交流を通じ社会性を維持する（4点）

6. 社会的関係の維持（小計 10点）
- 同年代との交流機会を確保（オンライン含む）（5点）
- 家族とのコミュニケーションを支援する（5点）

7. 家族支援（小計 12点）
- 母親の負担軽減に向けた支援調整（5点）
- 家族の不安や疲労を傾聴する（4点）
- きょうだいとの関係維持を支援する（3点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 6: Pediatric Nursing - Care During Remission Induction Therapy for Childhood Leukemia (Chronic Phase)

Patient Information:
Child A, a boy aged 10 years 6 months, fifth grade. Diagnosis: acute lymphoblastic leukemia (ALL). He is undergoing remission induction therapy; his general condition is stable, but he is in the myelosuppression phase and at high risk of infection.
History of varicella; immunizations completed (BCG, DPT-IPV, MR, mumps). Height 148.2 cm, weight 40.5 kg; development age-appropriate; active, likes soccer, good friendships. Family of five: father (43, self-employed), mother (40, helps the business), younger brother (7), younger sister (3). Previously healthy with a good school life.

Clinical Data:
Vital signs: T 36.5°C · P 84/min · RR 18/min · BP 104/70 mmHg
Myelosuppression (low WBC); oral mucositis (improving); decreased appetite / selective eating; tendency to constipation
Chemotherapy: VCR · L-asp · DNR · MTX (intrathecal) · Ara-C (intrathecal). Steroid: prednisolone. Supportive: ondansetron · ST combination (PCP prophylaxis) · amphotericin B syrup
Labs: WBC 0.7x10³/μL · Hb 8.5 g/dL · Plt 63x10³/μL · CRP 0.00 mg/dL
In hospital: private room for infection control; all activity in room; enjoys light rehab; sometimes misses visiting class; long hours on games/videos
Self-care: handwashing/disinfection inadequate; brushes teeth ~once/day (not established); makes resistant remarks to nurses
Psychosocial: says "can't keep up with studies," low learning motivation; online contact with peers; disrupted routine (stays up late); anxious about bone-marrow exams
Family: mother attends ~every 2-3 days, feels burdened by childcare/work/visits; father's visits difficult
Orders: free in ward; pediatric diet (home food OK, no raw food, heated only); bathing OK (protect CV site); VS x3/day; weight x1/day; supportive therapy for fever/vomiting; transfuse as needed

Question:
What nursing care would you, as a nursing student, provide for Child A in the chronic phase of remission induction therapy - including support for acquiring self-care behaviors and for psychosocial aspects?

Key Answer (Scoring Rubric):
1. Physical health management (Subtotal 22)
- Thorough infection prevention (myelosuppression) (8 points)
- Pain relief and oral care for mucositis (5 points)
- Manage nausea / poor appetite (adjust meal form) (5 points)
- Manage constipation (bowel control) (4 points)

2. Support for self-care behaviors (Subtotal 20)
- Explain handwashing/toothbrushing at his developmental stage (6 points)
- Praise what he does well to build self-efficacy (5 points)
- Respect his wishes rather than one-way instruction (5 points)
- Make behavior visible (checklist) (4 points)

3. Adjusting daily routine (Subtotal 12)
- Support sleep-wake rhythm (5 points)
- Appropriately control game time (4 points)
- Promote daytime activity (study, rehab) (3 points)

4. Psychological support (Subtotal 12)
- Listen to anxiety about exams/treatment (6 points)
- Empathize with feeling he "can't keep up with studies" (6 points)

5. Developmental & learning support (Subtotal 12)
- Encourage participation in the visiting class (4 points)
- Provide learning support for success experiences (4 points)
- Maintain social skills through play/interaction (4 points)

6. Maintaining social relationships (Subtotal 10)
- Ensure peer interaction (including online) (5 points)
- Support communication with the family (5 points)

7. Family support (Subtotal 12)
- Coordinate support to reduce the mother's burden (5 points)
- Listen to family anxiety and fatigue (4 points)
- Support maintaining sibling relationships (3 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    7: {
        ja: `
シナリオ7：高齢者看護学：認知機能障害および認知症ケア（認知症患者のコミュニケーションおよび安全安楽なケア）

患者情報:
田中重吉さん、75歳、男性。10年ほど前から物忘れが現れ、5年前にアルツハイマー型認知症と診断。加齢による嚥下機能の低下あり。5日前に発熱・呼吸苦・咳嗽で受診し誤嚥性肺炎と診断され入院。現在、肺炎は軽快しているが、苛立ちや攻撃的な言動がみられ援助を拒否することが多い。今朝、看護師の清拭の提案を拒否し、頻回に点滴の刺入部を触っている。

臨床データ:
疾患：誤嚥性肺炎　・既往：アルツハイマー型認知症
治療：第3世代セファロスポリン 1g/日 静脈注射；STおよびPTによるリハビリテーション
状態：FASTステージ5（中等度の認知機能低下）
ADL：短時間であれば座位保持可能。立位時は軽介助。食事（全粥・刻み食）、清潔・更衣、および排泄において声掛けや介助が必要。
バイタルサイン：体温36.4°C・脈拍84回/分・血圧140/86mmHg・SpO₂ 95%（ルームエアー）

設問:
田中さんが清潔の援助を受け、落ち着いて療養できるよう、どのようなコミュニケーションやかかわりをしますか？

主要な解答（採点ルーブリック）:
1. コミュニケーション（小計 40点）
- 開始時：視線の高さを合わせアイコンタクト（5点）
- 正面から、ゆっくり低い声、ジェスチャーを用いる（5点）
- 毎回、名札を見せて自己紹介する（4点）
- 拒否時：拒否する気持ちを受け入れる（5点）
- 拒否の理由を尋ねる（4点）
- 意思を確認し尊重する（4点）
- 無理強いせず時間を置いて再提案する（4点）
- 平易な言葉で繰り返し、言葉が出るまで待つ（3点）
- 短い文章・Yes/Noのクローズドクエスチョン（2点）
- ポジティブな声かけ（4点）

2. 環境調整（小計 30点）
- 点滴刺入部を衣類で覆う（5点）
- 温度・湿度を調整する（3点）
- 危険（ベッド高・柵・コード）を取り除く（4点）
- なじみのあるスタッフが続けて関わる（6点）
- 使い慣れた物を持ち込む（4点）
- 以前の部屋の配置に近づけ、家族の面会を依頼する（8点）

3. 関わり（小計 30点）
- 睡眠・覚醒・排泄パターンを把握する（6点）
- 日中は覚醒を促し活動と休息のバランスをとる（6点）
- リアリティオリエンテーション（時計・カレンダー）（6点）
- 身だしなみ・手洗いで時間感覚を取り戻す（5点）
- リハビリ・食事後は休憩を挟み疲労を防ぐ（4点）
- 頻回の尿意は散歩・音楽で意識をそらす（3点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 7: Gerontological Nursing - Cognitive Impairment & Dementia Care (Communication and Safe, Comfortable Care)

Patient Information:
Mr. Jukichi Tanaka, 75-year-old man. Forgetfulness began ~10 years ago; diagnosed with Alzheimer-type dementia 5 years ago. He has age-related decline in swallowing. Five days ago he developed fever, breathing difficulty, and cough; he was diagnosed with aspiration pneumonia and admitted. The pneumonia is now improving, but he shows irritability and aggressive speech/behavior and often refuses assistance. This morning he refused a nurse's offer of a bed bath and repeatedly touches his IV insertion site.

Clinical Data:
Disease: aspiration pneumonia · History: Alzheimer-type dementia
Treatment: 3rd-generation cephalosporin 1 g/day IV; ST and PT rehabilitation
Status: FAST stage 5 (moderate cognitive decline)
ADL: sits for short periods; light assist to stand; needs prompting/assistance with meals (full congee, chopped diet), hygiene/dressing, and toileting
Vital signs: T 36.4°C · P 84/min · BP 140/86 mmHg · SpO₂ 95% (room air)

Question:
What communication and engagement would you use so that Mr. Tanaka can accept assistance with hygiene and recuperate calmly?

Key Answer (Scoring Rubric):
1. Communication (Subtotal 40)
- Start: eye contact at the same eye level (5 points)
- Approach from the front; slow, low voice; gestures (5 points)
- Introduce yourself each time, showing name badge (4 points)
- On refusal: accept his feelings of refusal (5 points)
- Ask the reason for refusal (4 points)
- Confirm and respect his wishes (4 points)
- Do not force; retry after some time (4 points)
- Use plain words; repeat as needed; wait for words (3 points)
- Short sentences / closed yes-no questions (2 points)
- Positive tone (4 points)

2. Environmental adjustment (Subtotal 30)
- Cover the IV site with clothing (5 points)
- Adjust temperature and humidity (3 points)
- Remove hazards (bed height, rails, cords) (4 points)
- Keep familiar staff involved consistently (6 points)
- Bring in familiar personal items (4 points)
- Replicate his previous room layout; invite family to visit (8 points)

3. Engagement (Subtotal 30)
- Assess sleep-wake and elimination patterns (6 points)
- Keep awake in daytime; balance activity and rest (6 points)
- Reality orientation (clock, calendar in view) (6 points)
- Support sense of time of day (grooming, handwashing in AM) (5 points)
- Rest after rehab and meals to prevent fatigue (4 points)
- Redirect frequent urination urges (walk, music) (3 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    8: {
        ja: `
シナリオ8：高齢者看護学：転倒予防および移動の援助（高齢患者のリスクアセスメントおよび介入）

患者情報:
坂本八重子さん、75歳、女性。60歳代から高血圧・脂質異常症を指摘され内服でコントロール、数年前から僧帽弁閉鎖不全がみられる。10日前から下肢のむくみと労作時呼吸困難が増悪し、かかりつけ医の紹介で市民病院に入院。薬物治療・食事療法・酸素1L/分を実施していたが、SpO₂が95%前後で呼吸困難もないため昨日酸素を中止、現在ルームエアーでSpO₂ 93〜95%。これまで清拭を実施しており、本日入院後初めてのシャワー浴を予定している。

臨床データ:
疾患：心不全（HFpEF）　・既往：高血圧、脂質異常症、動脈硬化症、心房細動、僧帽弁閉鎖不全症
薬剤：SGLT2阻害薬 10mg 朝食後・ARNI 100mg（分2、朝夕食後）・MRA 25mg 朝食後・β遮断薬 10mg 朝食後・フロセミド 40mg 朝食後・非ベンゾジアゼピン系（睡眠薬）5mg 就寝前・酸化マグネシウム 990mg（分3、毎食後）
食事：塩分制限食（6g/日）　・症状：下肢浮腫
ADL：室内であれば手すりを伝って歩行可能。立位・歩行時にふらつきがみられる。食事は自立。排泄時はナースコールで看護師を呼び、見守りのもと自立。歩行や更衣をした後は息切れがみられることがあり軽介助。日中はベッド上で過ごすことが多い。夜間2〜3回トイレを使用。認知機能は保たれている。
バイタルサイン：体温35.8°C・脈拍84回/分・血圧136/78mmHg・SpO₂ 94%（ルームエアー）

設問:
坂本さんの転倒リスクについてアセスメントしなさい。安全にシャワー浴を行うためにどのような看護計画を立案しますか？

主要な解答（採点ルーブリック）:
1. 観察・アセスメント（小計 40点）
- VS・SpO₂・呼吸状態・呼吸苦・浮腫・視力・聴力（8点）
- 歩行状態（姿勢・立位バランス・歩幅・ふらつき）（8点）
- 自覚症状（倦怠感・息切れ）（4点）
- 薬剤の用量・作用時間（降圧薬・利尿薬）（6点）
- ベッド周囲の環境（柵・照明）（4点）
- 衣服・履物（スリッパ・靴下・裾丈）（4点）
- 睡眠状況・日中の覚醒レベル（2点）
- 排泄回数・排泄時の動作（2点）
- 浴室・脱衣所の環境（手すり・シャワーチェア・床の濡れ）（2点）

2. 介入 ― 衣類・環境（小計 23点）
- 衣類・履物の調整（適合する靴・裾丈）（5点）
- ベッド：高さ調整・ストッパー確認・柵設置（5点）
- 浴室までの経路：手すり・車いす介助（5点）
- 浴室・脱衣所：室温湯温・椅子・床の濡れ・コード・車いす／酸素準備（8点）

3. 介入 ― 更衣・シャワー中の援助（小計 37点）
- 事前に排泄を済ませる（4点）
- 下衣の着脱介助（裾を踏まないように・転倒に注意）（5点）
- 歩行・方向転換時に手すりの把持を促す（7点）
- 石鹸の滑りに注意し十分に洗い流す（6点）
- シャワーチェアで起立・座位動作を減らす（5点）
- 洗髪・乾燥、靴下・靴の着脱を介助する（3点）
- SpO₂・呼吸に応じて酸素・車いすを用いる（4点）
- 帰室時にVS・SpO₂・呼吸・気分を観察し休養を促す（3点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 8: Gerontological Nursing - Fall Prevention & Mobility Assistance (Risk Assessment and Intervention)

Patient Information:
Ms. Yaeko Sakamoto, 75-year-old woman. Hypertension and dyslipidemia since her 60s, controlled with medication; mitral regurgitation for the past several years. Ten days ago her lower-limb edema and exertional dyspnea worsened, and she was admitted to the municipal hospital via her family doctor. She received drug therapy, dietary therapy, and oxygen 1 L/min; as SpO₂ stayed ~95% with no dyspnea, oxygen was stopped yesterday and she is now 93-95% on room air. Bed baths have been given so far; her first shower since admission is planned for today.

Clinical Data:
Disease: heart failure (HFpEF) · History: hypertension, dyslipidemia, arteriosclerosis, atrial fibrillation, mitral regurgitation
Drugs: SGLT2 inhibitor 10 mg AM · ARNI 100 mg (÷2, AM/PM) · MRA 25 mg AM · beta-blocker 10 mg AM · furosemide 40 mg AM · non-benzodiazepine hypnotic 5 mg HS · magnesium oxide 990 mg (÷3, after meals)
Diet: salt-restricted (6 g/day) · Symptom: lower-limb edema
ADL: walks indoors holding handrails, unsteady on standing/walking; independent with meals; toilets independently with supervision (calls nurse); light assist after walking/dressing due to breathlessness; in bed most of the day; toilets 2-3x/night; cognition preserved
Vital signs: T 35.8°C · P 84/min · BP 136/78 mmHg · SpO₂ 94% (room air)

Question:
Assess Ms. Sakamoto's risk of falling. What nursing plan would you draw up so that she can take a shower safely?

Key Answer (Scoring Rubric):
1. Observation / assessment (Subtotal 40)
- VS, SpO₂, respiratory status, dyspnea, edema, vision, hearing (8 points)
- Gait (posture, standing balance, stride, unsteadiness/leaning) (8 points)
- Subjective symptoms (fatigue, breathlessness) (4 points)
- Medication doses / timing (antihypertensives, diuretics) (6 points)
- Bed-area environment (rails, lighting) (4 points)
- Clothing / footwear (slippers, socks, garment length) (4 points)
- Sleep and daytime alertness (2 points)
- Elimination pattern and movements (2 points)
- Bathroom/changing environment (handrails, shower chair, wet floor) (2 points)

2. Intervention - clothing & environment (Subtotal 23)
- Adjust clothing/footwear (correct-size shoes, trouser length) (5 points)
- Bed: adjust height, check brakes, set rails (5 points)
- Route to bathroom: handrails, wheelchair assist (5 points)
- Bathroom/changing: temp & water temp, chair, wet floor, cords, wheelchair/O₂ ready (8 points)

3. Intervention - during dressing & shower (Subtotal 37)
- Have her toilet beforehand (4 points)
- Assist pants don/doff (avoid stepping/falling) (5 points)
- Encourage handrail grip when walking and turning (7 points)
- Guard against soap slips; rinse thoroughly (6 points)
- Use shower chair to reduce stand/sit movements (5 points)
- Assist hair wash/dry, socks and shoes (3 points)
- Provide O₂ / wheelchair per SpO₂ and respiration (4 points)
- On return: check VS, SpO₂, respiration, mood; encourage rest (3 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    9: {
        ja: `
シナリオ9：成人看護学（急性看護学）：胃がん術後1日目の看護

患者情報:
患者A氏、56歳、男性。診断名：胃がん。3か月前から心窩部痛があり受診、検査（胃内視鏡・CT等）で胃がん（肉眼的分類3型・潰瘍浸潤型）と診断され手術目的で入院。身長170cm、体重75kg（3か月前は80kg）。4人家族：妻（52歳）、長男（20歳）、次男（16歳）、妻は毎日面会。職業：会社員（コンピュータ会社の管理職）。性格：元々せっかち。

手術および術後経過:
麻酔：全身麻酔＋硬膜外麻酔　・術式：腹腔鏡下幽門側胃切除術＋リンパ節郭清、Billroth I　・手術時間3時間
ウィンスロー孔ドレーン（閉鎖式プリーツ型）；術直後はフェイスマスク酸素3L/分；覚醒良好；ドレーン排液は中等量血性；硬膜外モルヒネで創部痛は耐えられる程度；胃管からのコーヒー残渣様排液

術後1日目の状態:
ウィンスロー孔ドレーン留置中・胃管14Fr（左鼻腔、術後2日目抜去予定）・持続点滴（左前腕）・硬膜外モルヒネ・酸素は8:00に中止・尿道カテーテル14Fr
バイタルサイン：T 37.5°C・SpO₂ 97%（ルームエアー）・BP 126/62 mmHg・P 90/min（不整脈なし）・RR 22/min（浅い）・副雑音なし・少量の粘稠な痰
腹部：腸蠕動音聴取不可、排ガスなし、嘔気嘔吐なし・創部：硬膜外モルヒネで痛みは耐えられる程度、出血なし、周囲発赤なし、ドレーン排液50mL淡血性
検査：WBC 12,800/μL・RBC 3.55 M/μL・Hb 10.1 g/dL・Hct 31.2%・Plt 271,000/μL・TP 5.5・Alb 3.0・Na 132・K 3.9・Cl 100・glucose 135 mg/dL・CRP 12.5 mg/dL
患者の発言：「動いたら管が抜けたり、傷口が開かないですか。咳をするだけでも傷が痛いのに、動いたらどうなるんだろうと想像するだけでも怖いです。」

設問:
術後1日目の患者の初回離床で、看護学生としてどのように患者の全身状態を評価し、離床の援助を行いますか？

主要な解答（採点ルーブリック）:
1. 離床可能な全身状態の評価（小計 45点）
- バイタルサイン・意識レベル・失見当識（7点）
- SpO₂・呼吸音・胸郭の動き・喀痰・呼吸苦（7点）
- めまい・気分不良・四肢冷感・顔面蒼白（6点）
- ドレーン排液量・性状・刺入部（5点）
- 創部出血・創部痛（5点）
- ホーマンズ徴候・浮腫（DVT）（5点）
- 疼痛コントロールができているか（4点）
- 嘔気嘔吐・腹痛・腹部膨満・腸蠕動音（3点）
- 離床への意欲（3点）

2. 離床のための援助（小計 35点）
- 目的・方法を適切に説明する（5点）
- 疼痛を最小限にする方法で援助する（6点）
- 安全な環境整備（転倒・ルート抜去予防）（8点）
- ギャッチアップし状態に合わせ段階的に進める（6点）
- 端座位で再評価（意識・めまい・嘔気・疼痛）（6点）
- 安全歩行の注意（立ち位置・歩行中の観察）（4点）

3. 精神的支援（小計 20点）
- 寄り添い、安心を与える声かけ（5点）
- 患者の不安を傾聴する（5点）
- 訴えを否定せず受け止める（4点）
- 安全に援助することを説明する（3点）
- 小さな成功体験を支え意欲を高める（3点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 9: Adult Nursing (Acute Care) - Care on Postoperative Day 1 After Gastric Cancer Surgery

Patient Information:
Patient A, a 56-year-old man. Diagnosis: gastric cancer. He had epigastric pain from 3 months ago; investigations (endoscopy, CT) diagnosed gastric cancer (macroscopic type 3, ulcerative-infiltrative) and he was admitted for surgery. Height 170 cm, weight 75 kg (80 kg three months ago). Family of four: wife (52), eldest son (20), second son (16); wife visits daily. Occupation: company manager (computer company). Personality: impatient by nature.

Surgery & Postoperative Course:
Anesthesia: general + epidural · Procedure: laparoscopic distal subtotal gastrectomy + lymph node dissection, Billroth I · Operative time 3 h
Winslow's foramen drain (closed pleated type); face-mask O₂ 3 L/min immediately post-op; good emergence; moderate bloody drain output; epidural morphine keeps wound pain tolerable; coffee-ground drainage from gastric tube

Condition on Postoperative Day 1:
Winslow's drain in place · gastric tube 14 Fr (L nostril, remove POD 2) · continuous IV (L forearm) · epidural morphine · O₂ stopped 08:00 · indwelling urinary catheter 14 Fr
Vital signs: T 37.5°C · SpO₂ 97% (room air) · BP 126/62 mmHg · P 90/min (no arrhythmia) · RR 22/min (shallow) · no adventitious sounds · small viscous sputum
Abdomen: bowel sounds not audible, no flatus, no nausea/vomiting · Wound: pain tolerable on epidural morphine, no bleeding, no surrounding redness, 50 mL light-bloody drain output
Labs: WBC 12,800/μL · RBC 3.55 M/μL · Hb 10.1 g/dL · Hct 31.2% · Plt 271,000/μL · TP 5.5 · Alb 3.0 · Na 132 · K 3.9 · Cl 100 · glucose 135 mg/dL · CRP 12.5 mg/dL
Patient's statement: "If I move, won't the tubes come out or the wound open? Even coughing makes the wound hurt, so just imagining what would happen if I moved is frightening."

Question:
For this patient's first mobilization out of bed on postoperative day 1, how would you, as a nursing student, assess the patient's general condition and assist with mobilization?

Key Answer (Scoring Rubric):
1. Assessment of readiness to mobilize (Subtotal 45)
- VS, consciousness, disorientation (7 points)
- SpO₂, breath sounds, chest movement, sputum, dyspnea (7 points)
- Dizziness, feeling unwell, cold limbs, pallor (6 points)
- Drain output amount, character, insertion site (5 points)
- Wound bleeding and pain (5 points)
- Homans' sign / edema (DVT) (5 points)
- Pain adequately controlled (4 points)
- Nausea/vomiting, abdominal pain/distension, bowel sounds (3 points)
- Motivation for mobilization (3 points)

2. Assistance with mobilization (Subtotal 35)
- Explain purpose and method appropriately (5 points)
- Assist using pain-minimizing methods (6 points)
- Prepare a safe environment (falls, line/tube dislodgement) (8 points)
- Raise HOB; progress in stages per condition (6 points)
- Reassess at edge-sitting (consciousness, dizziness, nausea, pain) (6 points)
- Precautions for safe walking (support position, observe) (4 points)

3. Psychological support (Subtotal 20)
- Stay close; give reassuring words (5 points)
- Listen to the patient's anxiety (5 points)
- Accept complaints without dismissing them (4 points)
- Explain that assistance is provided safely (3 points)
- Support small successes; boost motivation (3 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    },
    10: {
        ja: `
シナリオ10：成人看護領域（慢性看護学）：肝硬変と診断された患者への生活指導

患者情報:
患者A氏、50歳、男性。診断名：肝硬変。45歳時に職場健診で肝機能障害を指摘され外来でフォロー中、検査データ悪化のため精査目的で入院。身長170cm、体重75kg。特記すべき既往なし。妻（48歳）、長男（23歳）、長女（18歳）と同居。会社員（管理職）、営業で外食が多い。真面目で責任感が強く、頑固で負けず嫌い。
嗜好：飲酒（日本酒3〜4合または缶ビール2〜3本／日、就寝前に酎ハイ1本）。運動習慣なし。朝食は決まった時間に自宅で食べるが、昼・夕食は不規則（外食が多く、肉類が好きで野菜は苦手）。睡眠は約5時間／日。

身体所見:
バイタルサイン：T 36.2°C・P 62/min・RR 16/min・BP 138/76 mmHg
症状：全身倦怠感・易疲労感；食欲なし；嘔気嘔吐なし；軽度の腹部膨満；ごく軽度の眼球結膜黄染；掻痒なし；浮腫なし；肝性昏睡度0；排便2〜3日に1回（本日排便あり）
検査：AST 123・ALT 130・γ-GTP 98 IU/L・TP 6.2・ALB 3.0 g/dL・T-Bil 2.3 mg/dL・NH₃ 120 µg/dL・RBC 4.35 M/µL・WBC 7,800/µL・Hb 16.0 g/dL・Hct 42%・Plt 168,000/µL・APTT 38.1 s・PT 94%・PT-INR 1.2
超音波/CT：肝表面不整、辺縁鈍化、萎縮；軽度の門脈拡張；少量の腹水；脾腫なし
上部消化管内視鏡：食道静脈瘤あり、出血所見なし - LmF1CbRC(−)

設問:
A氏の身体所見結果から肝硬変の重症度や肝臓の予備能を評価し、A氏の症状悪化予防に必要な生活指導を行ってください。

主要な解答（採点ルーブリック）:
1. 重症度・肝予備能の評価（小計 40点）
- Alb、T-Bil、PT（PT-INR）、腹水、肝性脳症の5項目を確認できる（6点）
- Albの役割と低下時の症状（腹水・浮腫）の両方を含めて説明できる（3点）
- T-Bil（総ビリルビン）の役割と上昇時には黄疸が出現することを説明できる（3点）
- PT（プロトロンビン時間）の役割と延長すると出血傾向が生じることを説明できる（3点）
- 腹水は、門脈圧亢進や低アルブミン血症によって生じ、呼吸困難につながることを説明できる（3点）
- 肝性脳症は、アンモニア代謝障害によって生じ、意識障害や羽ばたき振戦が出現することを説明できる（4点）
- 代償期肝硬変には、全身倦怠感、易疲労感、食欲低下などの症状がみられることを説明できる（6点）
- 非代償期肝硬変には、黄疸、腹水、食道胃静脈瘤、肝性脳症などの合併症がみられることを説明できる（6点）

2. 症状悪化を予防する食事指導（小計 60点）
- アルコールが肝細胞障害を進行させることを説明できる（5点）
- 少量の飲酒でも病状悪化につながる可能性を説明できる（5点）
- 完全禁酒の必要性を説明できる（5点）
- 塩分過剰摂取が体内の水分貯留を促進することを説明できる（6点）
- 一般的な目安（6g/日未満など）を説明できる（6点）
- 肝硬変患者では低栄養になりやすいことを説明できる（3点）
- 筋肉量維持のために適切なたんぱく質摂取が必要であることを説明できる（3点）
- 肉・魚・卵・大豆製品など良質なたんぱく質を例示できる（3点）
- 肝性脳症出現時は医師・栄養士の指示に従う必要があることを説明できる（3点）
- 便秘がアンモニア産生を増加させることを説明できる（3点）
- 野菜、海藻、きのこ類など食物繊維を含む食品を例示できる（3点）
- 水分摂取や規則的な排便習慣の必要性を説明できる（3点）
- 門脈圧亢進によって食道静脈瘤が形成されることを説明できる（3点）
- 食道静脈瘤が形成されている場合、硬い食品（せんべい、ナッツ類など）を避ける理由を説明できる（3点）
- 食道静脈瘤が形成されている場合、香辛料など刺激の強い食品への注意を説明できる（3点）
- 食道静脈瘤が形成されている場合、強いいきみや重い物を持つ行為など腹圧上昇を避ける必要性を説明できる（3点）

合計 100点
備考: 音声誤差許容 ＋20〜30%（推奨25%）。合格は60%以上。
`,
        en: `
Scenario 10: Adult Nursing (Chronic Care) - Lifestyle Guidance for a Patient Diagnosed with Liver Cirrhosis

Patient Information:
Patient A, a 50-year-old man. Diagnosis: liver cirrhosis. At age 45, liver dysfunction was found at a workplace checkup and he has been followed as an outpatient; admitted for detailed examination due to worsening test data. Height 170 cm, weight 75 kg. No medical history of note. Lives with wife (48), eldest son (23), eldest daughter (18). Company manager; often eats out for work. Serious and responsible, stubborn and hates to lose.
Habits: alcohol (3-4 gō of sake or 2-3 cans of beer per day, plus one chūhai before bed). No exercise habit. Breakfast at a fixed time at home, but lunch/dinner irregular (often eats out, likes meat, dislikes vegetables). Sleeps ~5 hours/day.

Physical Findings:
Vital signs: T 36.2°C · P 62/min · RR 16/min · BP 138/76 mmHg
Symptoms: general malaise and fatigue; no appetite; no nausea/vomiting; mild abdominal distension; very mild scleral jaundice; no itching; no edema; hepatic coma grade 0; bowel movement every 2-3 days (had one today)
Labs: AST 123 · ALT 130 · γ-GTP 98 IU/L · TP 6.2 · ALB 3.0 g/dL · T-Bil 2.3 mg/dL · NH₃ 120 µg/dL · RBC 4.35 M/µL · WBC 7,800/µL · Hb 16.0 g/dL · Hct 42% · Plt 168,000/µL · APTT 38.1 s · PT 94% · PT-INR 1.2
US/CT: irregular liver surface, blunted margins, atrophy; mild portal-vein dilation; small ascites; no splenomegaly
Upper GI endoscopy: esophageal varices present, no bleeding signs - LmF1CbRC(−)

Question:
From Mr. A's physical findings, evaluate the severity of the cirrhosis and his hepatic functional reserve, and provide the lifestyle guidance needed to prevent his symptoms from worsening.

Key Answer (Scoring Rubric):
1. Evaluating severity & hepatic reserve (Subtotal 40)
- Alb, T-Bil, PT (PT-INR), ascites, and hepatic encephalopathy can all be assessed (6 points)
- Explain both the role of albumin (Alb) and the symptoms (ascites and edema) associated with decreased albumin levels (3 points)
- Explain the role of T-Bil and its association with jaundice (3 points)
- Explain the role of prothrombin time (PT) and that prolonged PT can increase bleeding tendency (3 points)
- Explain that ascites results from portal hypertension and hypoalbuminemia and can lead to respiratory distress (3 points)
- Explain that hepatic encephalopathy results from impaired ammonia metabolism and can cause altered consciousness and asterixis (4 points)
- Explain that compensated cirrhosis can present with symptoms such as general fatigue, easy fatigability, and loss of appetite (6 points)
- Explain that decompensated cirrhosis can lead to complications such as jaundice, ascites, esophagogastric varices, and hepatic encephalopathy (6 points)

2. Dietary guidance to prevent worsening (Subtotal 60)
- Explain that alcohol accelerates hepatocellular injury and disease progression (5 points)
- Explain that even small amounts of alcohol may worsen the disease (5 points)
- Explain the necessity of complete alcohol abstinence (5 points)
- Explain that excessive salt intake promotes fluid retention in the body (6 points)
- Explain general dietary recommendations, such as limiting salt intake to less than 6 g per day (6 points)
- Explain that patients with cirrhosis are at high risk of malnutrition (3 points)
- Explain that adequate protein intake is necessary to maintain muscle mass (3 points)
- Explain examples of high-quality protein sources, such as meat, fish, eggs, and soy products (3 points)
- Explain that patients with hepatic encephalopathy should follow the instructions of their physician and dietitian (3 points)
- Explain that constipation increases ammonia production (3 points)
- Explain examples of fiber-rich foods, such as vegetables, seaweed, and mushrooms (3 points)
- Explain the importance of adequate fluid intake and maintaining regular bowel habits (3 points)
- Explain that portal hypertension leads to the formation of esophageal varices (3 points)
- Explain why hard foods, such as rice crackers and nuts, should be avoided in patients with esophageal varices (3 points)
- Explain the need for caution with highly irritating foods, such as spicy foods, in patients with esophageal varices (3 points)
- Explain the need to avoid activities that increase intra-abdominal pressure, such as straining during bowel movements or lifting heavy objects (3 points)

TOTAL 100
Note: Voice-error allowance +20-30% (recommended 25%). Pass >= 60%.
`
    }
};

module.exports = { otamaeAnswerKeys };

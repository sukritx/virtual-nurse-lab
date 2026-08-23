import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae6 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab6 = response.data.labs.find(lab => lab.labInfo.labNumber === 6);
                if (lab6) {
                    setAttemptsLeft(lab6.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };
        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        setLanguage(event.target.value);
    };

    const content = {
        ja: {
            title: "シナリオ6：小児看護学：小児白血病をもつ子どもに対する寛解導入療法中の看護（慢性期）",
            subtitle: "",
            description: "Aくん、10歳6か月、男児、小学5年生。診断名：急性リンパ性白血病（ALL）。寛解導入療法中。全身状態は安定しているが、骨髄抑制期にあり感染リスクが高い。\n水痘既往あり、予防接種済（BCG・四種混合・麻疹風疹・ムンプス）。身長148.2cm、体重40.5kg、発達は年齢相応。活発でサッカー好き、友人関係良好。5人家族：父（43歳・自営業）、母（40歳・自営業手伝い）、弟（7歳）、妹（3歳）。これまで健康で学校生活も良好。\nバイタルサイン：T 36.5°C・P 84/min・RR 18/min・BP 104/70 mmHg\n骨髄抑制（白血球低値）；口内炎（改善傾向）；食欲低下／偏食；便秘傾向\n化学療法：VCR・L-asp・DNR・MTX（髄注）・Ara-C（髄注）。ステロイド：プレドニゾロン。支持療法：オンダンセトロン・ST合剤（PCP予防）・アムホテリシンBシロップ\n検査：WBC 0.7×10³/μL・Hb 8.5 g/dL・Plt 63×10³/μL・CRP 0.00 mg/dL\n入院中：感染対策のため個室；行動範囲は室内；軽いリハビリを楽しむ；院内学級に時々欠席；ゲーム・動画の時間が長い\nセルフケア：手洗い・消毒が不十分；歯磨きは1日1回程度（習慣化していない）；看護師への反抗的な発言あり\n心理社会的：「勉強についていけない」と発言、学習意欲低下；同級生とオンライン交流；生活リズムの乱れ（夜更かし）；骨髄穿刺への不安\n家族：母は2〜3日に1回程度面会、育児・仕事・面会の負担感あり；父の面会は困難\n指示：病棟内自由；小児食（持ち込み可、生もの不可、加熱のみ）；入浴可（CV刺入部保護）；バイタルサイン×3/日；体重×1/日；発熱・嘔吐時の支持療法；必要時輸血",
            questions: [
                "寛解導入療法中の慢性期にあるAくんに対して、看護学生としてどのような看護を提供しますか？特に、セルフケア行動の獲得および心理社会的側面への支援を含めて考えましょう。"
            ]
        },
        en: {
            title: "Scenario 6: Pediatric Nursing - Care During Remission Induction Therapy for Childhood Leukemia (Chronic Phase)",
            subtitle: "",
            description: "Child A, a boy aged 10 years 6 months, fifth grade. Diagnosis: acute lymphoblastic leukemia (ALL). He is undergoing remission induction therapy; his general condition is stable, but he is in the myelosuppression phase and at high risk of infection.\nHistory of varicella; immunizations completed (BCG, DPT-IPV, MR, mumps). Height 148.2 cm, weight 40.5 kg; development age-appropriate; active, likes soccer, good friendships. Family of five: father (43, self-employed), mother (40, helps the business), younger brother (7), younger sister (3). Previously healthy with a good school life.\nVital signs: T 36.5°C · P 84/min · RR 18/min · BP 104/70 mmHg\nMyelosuppression (low WBC); oral mucositis (improving); decreased appetite / selective eating; tendency to constipation\nChemotherapy: VCR · L-asp · DNR · MTX (intrathecal) · Ara-C (intrathecal). Steroid: prednisolone. Supportive: ondansetron · ST combination (PCP prophylaxis) · amphotericin B syrup\nLabs: WBC 0.7x10³/μL · Hb 8.5 g/dL · Plt 63x10³/μL · CRP 0.00 mg/dL\nIn hospital: private room for infection control; all activity in room; enjoys light rehab; sometimes misses visiting class; long hours on games/videos\nSelf-care: handwashing/disinfection inadequate; brushes teeth ~once/day (not established); makes resistant remarks to nurses\nPsychosocial: says \"can't keep up with studies,\" low learning motivation; online contact with peers; disrupted routine (stays up late); anxious about bone-marrow exams\nFamily: mother attends ~every 2-3 days, feels burdened by childcare/work/visits; father's visits difficult\nOrders: free in ward; pediatric diet (home food OK, no raw food, heated only); bathing OK (protect CV site); VS x3/day; weight x1/day; supportive therapy for fever/vomiting; transfuse as needed",
            questions: [
                "What nursing care would you, as a nursing student, provide for Child A in the chronic phase of remission induction therapy - including support for acquiring self-care behaviors and for psychosocial aspects?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={6}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_6_Pediatric_Nursing_Care.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae6;

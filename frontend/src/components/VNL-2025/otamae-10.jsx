import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae10 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab10 = response.data.labs.find(lab => lab.labInfo.labNumber === 10);
                if (lab10) {
                    setAttemptsLeft(lab10.attemptsLeft);
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
            title: "シナリオ10：成人看護領域（慢性看護学）：肝硬変と診断された患者への生活指導",
            subtitle: "",
            description: "患者A氏、50歳、男性。診断名：肝硬変。45歳時に職場健診で肝機能障害を指摘され外来でフォロー中、検査データ悪化のため精査目的で入院。身長170cm、体重75kg。特記すべき既往なし。妻（48歳）、長男（23歳）、長女（18歳）と同居。会社員（管理職）、営業で外食が多い。真面目で責任感が強く、頑固で負けず嫌い。\n嗜好：飲酒（日本酒3〜4合または缶ビール2〜3本／日、就寝前に酎ハイ1本）。運動習慣なし。朝食は決まった時間に自宅で食べるが、昼・夕食は不規則（外食が多く、肉類が好きで野菜は苦手）。睡眠は約5時間／日。\nバイタルサイン：T 36.2°C・P 62/min・RR 16/min・BP 138/76 mmHg\n症状：全身倦怠感・易疲労感；食欲なし；嘔気嘔吐なし；軽度の腹部膨満；ごく軽度の眼球結膜黄染；掻痒なし；浮腫なし；肝性昏睡度0；排便2〜3日に1回（本日排便あり）\n検査：AST 123・ALT 130・γ-GTP 98 IU/L・TP 6.2・ALB 3.0 g/dL・T-Bil 2.3 mg/dL・NH₃ 120 µg/dL・RBC 4.35 M/µL・WBC 7,800/µL・Hb 16.0 g/dL・Hct 42%・Plt 168,000/µL・APTT 38.1 s・PT 94%・PT-INR 1.2\n超音波/CT：肝表面不整、辺縁鈍化、萎縮；軽度の門脈拡張；少量の腹水；脾腫なし\n上部消化管内視鏡：食道静脈瘤あり、出血所見なし - LmF1CbRC(−)",
            questions: [
                "A氏の身体所見結果から肝硬変の重症度や肝臓の予備能を評価し、A氏の症状悪化予防に必要な生活指導を行ってください。"
            ]
        },
        en: {
            title: "Scenario 10: Adult Nursing (Chronic Care) - Lifestyle Guidance for a Patient Diagnosed with Liver Cirrhosis",
            subtitle: "",
            description: "Patient A, a 50-year-old man. Diagnosis: liver cirrhosis. At age 45, liver dysfunction was found at a workplace checkup and he has been followed as an outpatient; admitted for detailed examination due to worsening test data. Height 170 cm, weight 75 kg. No medical history of note. Lives with wife (48), eldest son (23), eldest daughter (18). Company manager; often eats out for work. Serious and responsible, stubborn and hates to lose.\nHabits: alcohol (3-4 gō of sake or 2-3 cans of beer per day, plus one chūhai before bed). No exercise habit. Breakfast at a fixed time at home, but lunch/dinner irregular (often eats out, likes meat, dislikes vegetables). Sleeps ~5 hours/day.\nVital signs: T 36.2°C · P 62/min · RR 16/min · BP 138/76 mmHg\nSymptoms: general malaise and fatigue; no appetite; no nausea/vomiting; mild abdominal distension; very mild scleral jaundice; no itching; no edema; hepatic coma grade 0; bowel movement every 2-3 days (had one today)\nLabs: AST 123 · ALT 130 · γ-GTP 98 IU/L · TP 6.2 · ALB 3.0 g/dL · T-Bil 2.3 mg/dL · NH₃ 120 µg/dL · RBC 4.35 M/µL · WBC 7,800/µL · Hb 16.0 g/dL · Hct 42% · Plt 168,000/µL · APTT 38.1 s · PT 94% · PT-INR 1.2\nUS/CT: irregular liver surface, blunted margins, atrophy; mild portal-vein dilation; small ascites; no splenomegaly\nUpper GI endoscopy: esophageal varices present, no bleeding signs - LmF1CbRC(−)",
            questions: [
                "From Mr. A's physical findings, evaluate the severity of the cirrhosis and his hepatic functional reserve, and provide the lifestyle guidance needed to prevent his symptoms from worsening."
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={10}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_10_liver%20cirrhosis.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae10;

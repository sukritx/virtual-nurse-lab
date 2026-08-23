import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae7 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab7 = response.data.labs.find(lab => lab.labInfo.labNumber === 7);
                if (lab7) {
                    setAttemptsLeft(lab7.attemptsLeft);
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
            title: "シナリオ7：高齢者看護学：認知機能障害および認知症ケア（認知症患者のコミュニケーションおよび安全安楽なケア）",
            subtitle: "",
            description: "田中重吉さん、75歳、男性。10年ほど前から物忘れが現れ、5年前にアルツハイマー型認知症と診断。加齢による嚥下機能の低下あり。5日前に発熱・呼吸苦・咳嗽で受診し誤嚥性肺炎と診断され入院。現在、肺炎は軽快しているが、苛立ちや攻撃的な言動がみられ援助を拒否することが多い。今朝、看護師の清拭の提案を拒否し、頻回に点滴の刺入部を触っている。\n疾患：誤嚥性肺炎　・既往：アルツハイマー型認知症\n治療：第3世代セファロスポリン 1g/日 静脈注射；STおよびPTによるリハビリテーション\n状態：FASTステージ5（中等度の認知機能低下）\nADL：短時間であれば座位保持可能。立位時は軽介助。食事（全粥・刻み食）、清潔・更衣、および排泄において声掛けや介助が必要。\nバイタルサイン：体温36.4°C・脈拍84回/分・血圧140/86mmHg・SpO₂ 95%（ルームエアー）",
            questions: [
                "田中さんが清潔の援助を受け、落ち着いて療養できるよう、どのようなコミュニケーションやかかわりをしますか？"
            ]
        },
        en: {
            title: "Scenario 7: Gerontological Nursing - Cognitive Impairment & Dementia Care (Communication and Safe, Comfortable Care)",
            subtitle: "",
            description: "Mr. Jukichi Tanaka, 75-year-old man. Forgetfulness began ~10 years ago; diagnosed with Alzheimer-type dementia 5 years ago. He has age-related decline in swallowing. Five days ago he developed fever, breathing difficulty, and cough; he was diagnosed with aspiration pneumonia and admitted. The pneumonia is now improving, but he shows irritability and aggressive speech/behavior and often refuses assistance. This morning he refused a nurse's offer of a bed bath and repeatedly touches his IV insertion site.\nDisease: aspiration pneumonia · History: Alzheimer-type dementia\nTreatment: 3rd-generation cephalosporin 1 g/day IV; ST and PT rehabilitation\nStatus: FAST stage 5 (moderate cognitive decline)\nADL: sits for short periods; light assist to stand; needs prompting/assistance with meals (full congee, chopped diet), hygiene/dressing, and toileting\nVital signs: T 36.4°C · P 84/min · BP 140/86 mmHg · SpO₂ 95% (room air)",
            questions: [
                "What communication and engagement would you use so that Mr. Tanaka can accept assistance with hygiene and recuperate calmly?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={7}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_7_Dementia.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae7;

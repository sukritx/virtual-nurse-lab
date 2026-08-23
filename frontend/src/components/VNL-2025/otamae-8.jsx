import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae8 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab8 = response.data.labs.find(lab => lab.labInfo.labNumber === 8);
                if (lab8) {
                    setAttemptsLeft(lab8.attemptsLeft);
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
            title: "シナリオ8：高齢者看護学：転倒予防および移動の援助（高齢患者のリスクアセスメントおよび介入）",
            subtitle: "",
            description: "坂本八重子さん、75歳、女性。60歳代から高血圧・脂質異常症を指摘され内服でコントロール、数年前から僧帽弁閉鎖不全がみられる。10日前から下肢のむくみと労作時呼吸困難が増悪し、かかりつけ医の紹介で市民病院に入院。薬物治療・食事療法・酸素1L/分を実施していたが、SpO₂が95%前後で呼吸困難もないため昨日酸素を中止、現在ルームエアーでSpO₂ 93〜95%。これまで清拭を実施しており、本日入院後初めてのシャワー浴を予定している。\n疾患：心不全（HFpEF）　・既往：高血圧、脂質異常症、動脈硬化症、心房細動、僧帽弁閉鎖不全症\n薬剤：SGLT2阻害薬 10mg 朝食後・ARNI 100mg（分2、朝夕食後）・MRA 25mg 朝食後・β遮断薬 10mg 朝食後・フロセミド 40mg 朝食後・非ベンゾジアゼピン系（睡眠薬）5mg 就寝前・酸化マグネシウム 990mg（分3、毎食後）\n食事：塩分制限食（6g/日）　・症状：下肢浮腫\nADL：室内であれば手すりを伝って歩行可能。立位・歩行時にふらつきがみられる。食事は自立。排泄時はナースコールで看護師を呼び、見守りのもと自立。歩行や更衣をした後は息切れがみられることがあり軽介助。日中はベッド上で過ごすことが多い。夜間2〜3回トイレを使用。認知機能は保たれている。\nバイタルサイン：体温35.8°C・脈拍84回/分・血圧136/78mmHg・SpO₂ 94%（ルームエアー）",
            questions: [
                "坂本さんの転倒リスクについてアセスメントしなさい。安全にシャワー浴を行うためにどのような看護計画を立案しますか？"
            ]
        },
        en: {
            title: "Scenario 8: Gerontological Nursing - Fall Prevention & Mobility Assistance (Risk Assessment and Intervention)",
            subtitle: "",
            description: "Ms. Yaeko Sakamoto, 75-year-old woman. Hypertension and dyslipidemia since her 60s, controlled with medication; mitral regurgitation for the past several years. Ten days ago her lower-limb edema and exertional dyspnea worsened, and she was admitted to the municipal hospital via her family doctor. She received drug therapy, dietary therapy, and oxygen 1 L/min; as SpO₂ stayed ~95% with no dyspnea, oxygen was stopped yesterday and she is now 93-95% on room air. Bed baths have been given so far; her first shower since admission is planned for today.\nDisease: heart failure (HFpEF) · History: hypertension, dyslipidemia, arteriosclerosis, atrial fibrillation, mitral regurgitation\nDrugs: SGLT2 inhibitor 10 mg AM · ARNI 100 mg (÷2, AM/PM) · MRA 25 mg AM · beta-blocker 10 mg AM · furosemide 40 mg AM · non-benzodiazepine hypnotic 5 mg HS · magnesium oxide 990 mg (÷3, after meals)\nDiet: salt-restricted (6 g/day) · Symptom: lower-limb edema\nADL: walks indoors holding handrails, unsteady on standing/walking; independent with meals; toilets independently with supervision (calls nurse); light assist after walking/dressing due to breathlessness; in bed most of the day; toilets 2-3x/night; cognition preserved\nVital signs: T 35.8°C · P 84/min · BP 136/78 mmHg · SpO₂ 94% (room air)",
            questions: [
                "Assess Ms. Sakamoto's risk of falling. What nursing plan would you draw up so that she can take a shower safely?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={8}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_8_Fall%20Prevention.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae8;

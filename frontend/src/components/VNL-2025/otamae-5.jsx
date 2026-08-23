import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae5 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab5 = response.data.labs.find(lab => lab.labInfo.labNumber === 5);
                if (lab5) {
                    setAttemptsLeft(lab5.attemptsLeft);
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
            title: "シナリオ5：小児看護学：気管支喘息患児の看護",
            subtitle: "",
            description: "Aちゃん（5歳、男児）。診断名：気管支喘息大発作。入院1日目。酸素マスク5L/分実施中。左手背に末梢静脈路が確保されている。母の付き添いあり。不安が強く母に抱きついており、母も不安が強い様子である。\n身長110cm、体重18.0kg。2歳から喘息で治療中、年2〜3回受診（入院歴なし）。最後の発作は約3か月前でその後は良好にコントロール。普段の治療薬：長期管理薬に吸入ステロイド（アドエア）・モンテルカスト、発作時にサルブタモール吸入（メプチン）。アレルギー：ダニ・ハウスダスト。予防接種は年齢相応に済。両親は共働き、祖父母は遠方、父は喫煙（約10本/日）。\nバイタルサイン：RR 40/min・SpO₂ 91%（ルームエアー）→ 96%（O₂ 5L/min）・HR 130/min・BP 100/60 mmHg・T 37.3°C\n呼吸音は全体的に減弱し両側に著明な呼気性喘鳴；肩呼吸と肋下陥没；呼気延長；口唇チアノーゼ；単語から短い文章での会話；仰臥位不可（座位）；元気がない；食欲不振\n検査：WBC 13,800/μL・RBC 4.80 M/μL・Hb 13.1 g/dL・Hct 38%・Plt 310,000/μL・Na 136・K 3.8・Cl 100・glucose 100 mg/dL・CRP 0.5 mg/dL・胸部X線で過膨張、浸潤影なし・インフルエンザ/コロナ陰性\n治療：ソルデム3A 60 mL/h；メチルプレドニゾロンNaコハク酸エステル 20mg×4/日；モンテルカスト 4mg 夕食後；カルボシステイン 180mg 1日3回；サルブタモール（ベネトリン）×3/日；アドエア×2/日\n指示：SpO₂ 95%以上を維持；病室内安静；経口摂取可；清拭・シャワー浴可；SpO₂＋心電図モニター；バイタルサイン×4/日；喘鳴増強時ベネトリン吸入",
            questions: [
                "安楽な呼吸を保つために、看護学生としてどのように患児の全身状態を評価し、支援を行いますか？"
            ]
        },
        en: {
            title: "Scenario 5: Pediatric Nursing - Care of a Child with Bronchial Asthma",
            subtitle: "",
            description: "Child A (5-year-old boy). Diagnosis: bronchial asthma, severe attack. Day 1 of hospitalization; receiving oxygen 5 L/min via mask; a peripheral IV line is in place on the dorsum of the left hand. His mother is present; the child appears very anxious and clings to her, and the mother is also highly anxious.\nHeight 110 cm, weight 18.0 kg. Treated for asthma since age 2, with 2-3 attacks per year (no prior admission); last attack ~3 months ago, well controlled since. Usual medicines: inhaled corticosteroid (Adoair) and montelukast for control; inhaled salbutamol (Meptin) as reliever. Allergies: dust mites, house dust. Immunizations up to date. Lives with both working parents; grandparents live far away; father smokes ~10 cigarettes/day.\nVital signs: RR 40/min · SpO₂ 91% (room air) -> 96% (O₂ 5 L/min) · HR 130/min · BP 100/60 mmHg · T 37.3°C\nBreath sounds diminished overall with marked expiratory wheeze bilaterally; shoulder breathing and subcostal retractions; prolonged expiration; lip cyanosis; speaks in single words to short sentences; cannot lie flat (sits up); low energy; poor appetite\nLabs: WBC 13,800/μL · RBC 4.80 M/μL · Hb 13.1 g/dL · Hct 38% · Plt 310,000/μL · Na 136 · K 3.8 · Cl 100 · glucose 100 mg/dL · CRP 0.5 mg/dL · CXR hyperinflation, no infiltrate · influenza/coronavirus negative\nTreatment: Soldem 3A 60 mL/h; methylprednisolone Na succinate 20 mg x4/day; montelukast 4 mg after dinner; carbocisteine 180 mg TID; salbutamol (Venetlin) x3/day; Adoair x2/day\nOrders: maintain SpO₂ >=95%; rest in ward; oral intake OK; bed bath/shower OK; SpO₂ + ECG monitor; VS x4/day; Venetlin inhalation when wheeze worsens",
            questions: [
                "To help the child maintain comfortable breathing, how would you, as a nursing student, assess the child's general condition and provide support?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={5}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_5_Pediatric_Asthma.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae5;

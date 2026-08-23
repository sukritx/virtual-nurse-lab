import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae1 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
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
            title: "シナリオ1：基礎看護学：筋肉内注射（三角筋）",
            subtitle: "",
            description: "大手前氏は78歳の男性で、COVID-19ワクチンの追加接種を受けるために来院しました。既知の慢性疾患はなく、自宅で自立した生活を送っています。週1回のウォーキンググループや地域ボランティア活動に参加するなど、社会的にも活発です。定期的に服用している薬はなく、アレルギー、慢性疾患、ワクチンによる過去の副反応の既往もありません。現在、発熱や急性疾患の症状も否定しています。\n加齢に伴う聴力低下があり、時々聞き返すことがあります。診察中は落ち着いて協力的ですが、ワクチンの副作用について軽い不安を示しています。年齢を考慮し、安全性についての説明と安心感を求めており、十分な説明と適切な指導を受けたうえで接種を受ける意思を示しています。",
            questions: [
                "医師の指示のもと、この患者にCOVID-19ワクチンを筋肉内注射する場合、どのように実施しますか？"
            ]
        },
        en: {
            title: "Scenario 1: Fundamental Nursing - Intramuscular Injection (Deltoid Muscle)",
            subtitle: "",
            description: "Mr. Otemae is a 78-year-old man who has come to the clinic to receive a COVID-19 booster vaccination. He has no known chronic illnesses and lives independently at home. He is socially active, taking part in a weekly walking group and community volunteer activities. He takes no regular medications and has no history of allergies, chronic disease, or previous adverse reactions to vaccines. He currently denies fever or any symptoms of acute illness.\nHe has age-related hearing loss and occasionally asks for things to be repeated. He is calm and cooperative during the consultation but expresses mild anxiety about vaccine side effects. In view of his age, he is seeking explanation and reassurance about safety, and has indicated his willingness to be vaccinated after receiving sufficient explanation and appropriate guidance.",
            questions: [
                "Under a physician's order, how would you administer the COVID-19 vaccine to this patient by intramuscular injection?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={1}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_1_Intramuscular_Injection.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae1;

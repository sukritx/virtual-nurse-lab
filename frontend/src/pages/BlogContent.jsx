import { useParams, useNavigate } from 'react-router-dom';
import img1 from '../assets/img2.jpg';

const blogDetails = [
    {
        id: 1,
        title: "วิธีส่งไฟล์เข้าสู่ระบบ",
        date: "Dec, 2024",
        content: `
1. อัดเสียงผ่าน app ในเครื่องตนเอง
2. อัพโหลดไฟล์เสียงเข้าสู้ระบบ
3. รอผลการตรวจสอบจากระบบ
        `
    },
];

const BlogContent = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const blog = blogDetails.find(blog => blog.id === parseInt(id));

    const handleBack = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-screen flex justify-center px-4 sm:px-6 lg:px-8">
            <div className="writingContainer w-full max-w-[500px] relative my-8 sm:my-12 text-base leading-[30px]">
                <button 
                    onClick={handleBack}
                    className="mb-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition duration-300"
                >
                    &#8592; Back
                </button>
                <p className="text-gray-600 mb-2 text-sm sm:text-base">{blog.date}</p>
                <h1 className="text-2xl sm:text-4xl font-bold mb-4 text-gray-800">{blog.title}</h1>
                <img src={img1} alt={blog.title} className="w-full h-auto object-cover mb-4 rounded"/>
                <div className="text-gray-700 whitespace-pre-line text-sm sm:text-base">{blog.content}</div>
            </div>
        </div>
    );
};

export default BlogContent;
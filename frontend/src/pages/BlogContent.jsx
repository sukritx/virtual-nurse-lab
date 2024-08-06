import { useParams } from 'react-router-dom';
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
    const blog = blogDetails.find(blog => blog.id === parseInt(id));

    return (
        <div className="min-h-screen flex justify-center">
            <div className="writingContainer w-[500px] relative my-[50px] text-base leading-[30px]">
                <p className="text-gray-600 mb-2">{blog.date}</p>
                <h1 className="text-4xl font-bold mb-4 text-gray-800">{blog.title}</h1>
                <img src={img1} alt={blog.title} className="w-full h-auto object-cover mb-4 rounded"/>
                <div className="text-gray-700 whitespace-pre-line">{blog.content}</div>
            </div>
        </div>
    );
};

export default BlogContent;
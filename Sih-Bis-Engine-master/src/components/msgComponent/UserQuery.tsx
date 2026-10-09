interface UserQueryProps {
    user_query: string
}

const UserQuery = ({ user_query }: UserQueryProps) => {
    return (
        <div className='bg-blue-100/40 max-w-2xl w-fit px-4 py-2 rounded-md shadow'>
            {user_query}
        </div>
    )
}

export default UserQuery
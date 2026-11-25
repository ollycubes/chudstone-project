from .database import engine
from sqlalchemy import inspect, select, func, MetaData, Table


def check_db():

    # Check database connection configuration
    print("Database type:", engine.dialect.name)
    print("Database host:", engine.url.host)
    print("Database name:", engine.url.database)

    # Verify actual database connection
    with engine.connect() as connection:

        print("Connection successful!")

        # Inspect existing tables
        inspector = inspect(connection)
        tables = inspector.get_table_names()

        print("\nAvailable tables:")

        if not tables:
            print("No tables found.")

        # Check the number of records in each table
        for table_name in tables:

            table = Table(
                table_name,
                MetaData(),
                autoload_with=connection
            )

            count = connection.execute(
                select(func.count()).select_from(table)
            ).scalar_one()

            print(f"{table_name}: {count} records")


if __name__ == "__main__":
    check_db()
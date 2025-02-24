import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  IndexTable,
  useBreakpoints,
  Button,
  Pagination,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import PrintModal from "../utils/printModal";

async function fetchOrders(admin, cursor = null) {
  const query = `
    query getOrders($cursor: String) {
      orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
        nodes {
          name
          id
          createdAt
          customer {
            displayName
          }
          displayFinancialStatus
          displayFulfillmentStatus
          lineItems(first: 100) {
            edges {
              node {
                title
                quantity
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet { 
            presentmentMoney { 
              amount 
              currencyCode 
            } 
          }
          totalTaxSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
          hasPreviousPage
          startCursor
        }
      }
    }
  `;
  
  const response = await admin.graphql(
    query,
    {
      variables: {
        cursor: cursor
      }
    }
  );
  return response.json();
}

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const currentPage = parseInt(url.searchParams.get("page")) || 1;
    const pageSize = 100;
    
    // 첫 페이지 데이터 가져오기
    let cursor = null;
    let orders = [];
    let pageInfo = null;

    // 현재 페이지까지의 데이터 가져오기
    for (let i = 0; i < currentPage; i++) {
      const data = await fetchOrders(admin, cursor);
      if (!data) {
        throw new Error('Failed to fetch orders from Shopify');
      }

      if (i === currentPage - 1) {
        // 현재 페이지의 데이터만 저장
        orders = data.data.orders.nodes;
        pageInfo = data.data.orders.pageInfo;
      }
      
      // 다음 페이지를 위한 커서 업데이트
      cursor = data.data.orders.pageInfo.endCursor;
    }
    
    console.log('페이지 데이터:', {
      현재페이지: currentPage,
      다음페이지: pageInfo.hasNextPage,
      이전페이지: pageInfo.hasPreviousPage,
      시작커서: pageInfo.startCursor,
      마지막커서: pageInfo.endCursor,
      현재_페이지_주문수: orders.length
    });

    const formattedOrders = orders
      .map(node => ({
        id: node.name,
        order: node.id,
        displayName: node.customer?.displayName || '顧客情報無し',
        totalPrice: formatCurrency(parseFloat(node.totalPriceSet.presentmentMoney.amount)),
        subtotalPrice: formatCurrency(parseFloat(node.subtotalPriceSet.presentmentMoney.amount)),
        totalTax: formatCurrency(parseFloat(node.totalTaxSet.presentmentMoney.amount)),
        displayFinancialStatus: node.displayFinancialStatus,
        displayFulfillmentStatus: node.displayFulfillmentStatus,
        createdAt: node.createdAt.split('T')[0],
        items: node.lineItems.edges,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));

    return json({
      orders: formattedOrders,
      pagination: {
        currentPage,
        hasNextPage: pageInfo.hasNextPage,
        hasPreviousPage: currentPage > 1
      }
    });
  } catch (error) {
    console.error('app._index Loader Error : ', error);
    return json({ error: 'Failed to fetch orders.' }, { status: 500 });
  }
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

export default function Index() {
  const { orders, pagination } = useLoaderData();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const navigate = useNavigate();

  const handlePageChange = (newPage) => {
    navigate(`?page=${newPage}`);
  };

  const resourceName = {
    singular: 'order',
    plural: 'orders',
  };

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {order.id}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.createdAt}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayName}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span">
            {order.totalPrice}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{order.displayFinancialStatus}</IndexTable.Cell>
        <IndexTable.Cell>{order.displayFulfillmentStatus}</IndexTable.Cell>
        <IndexTable.Cell>
        <Button onClick={() => setSelectedOrder(order)}>領収書</Button>
        </IndexTable.Cell>
      </IndexTable.Row>
  ));

  return (
    <Page fullWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <IndexTable
              condensed={useBreakpoints().smDown}
              resourceName={resourceName}
              itemCount={orders.length}
              headings={[
                {title: '注文'},
                {title: '日付'},
                {title: 'お客様（請求先／配送先）'},
                {title: '合計'},
                {title: '支払い'},
                {title: 'フルフィルメント'},
                {title: ''},
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
              <Pagination
                label={`${pagination.currentPage} 페이지`}
                hasPrevious={pagination.hasPreviousPage}
                hasNext={pagination.hasNextPage}
                onPrevious={() => handlePageChange(pagination.currentPage - 1)}
                onNext={() => handlePageChange(pagination.currentPage + 1)}
              />
            </div>
          </Card>
        </Layout.Section>
      </Layout>
      {selectedOrder && (
        <PrintModal
          order={selectedOrder}
          open={() => setSelectedOrder(null)}
        />
      )}
    </Page>
  );
}